import { z } from "zod";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { systemDb, withActor, type Tx } from "@/lib/db";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { deleteObject, MAX_AUDIO_BYTES, putObject, signedGetUrl, sniffAudio } from "@/lib/storage";
import type { Actor } from "@/lib/session";
import { createHash, randomUUID } from "node:crypto";
import { notify, studentAudience } from "../notifications/service";
import { advanceCursor, suggestDay, type PlanInput } from "./planner";
import { addDays, dayOnly, nextReview } from "./srs";
import { approved } from "@/lib/scholarly";

export const planSchema = z.object({
  studentId: z.string().min(1),
  curriculumId: z.string().min(1).nullable().optional(),
  goal: z.string().trim().max(200).nullable().optional(),
  dailyMinutes: z.coerce.number().int().min(10).max(240),
  newAyahsPerDay: z.coerce.number().int().min(1).max(40),
  studyDays: z.array(z.coerce.number().int().min(0).max(6)).min(1).default([0, 1, 2, 3, 4]),
  direction: z.enum(["REVERSE", "FORWARD"]).default("REVERSE"),
  cursorSurah: z.coerce.number().int().min(1).max(114).optional(),
  cursorAyah: z.coerce.number().int().min(1).default(1),
});

export async function createPlan(actor: Actor, input: z.infer<typeof planSchema>) {
  const plan = await withActor(actor, async (tx) => {
    // Ending the previous plan keeps its history for the student's record.
    await tx.learningPlan.updateMany({ where: { studentId: input.studentId, status: "ACTIVE" }, data: { status: "COMPLETED" } });
    return tx.learningPlan.create({
      data: {
        ...input,
        cursorSurah: input.cursorSurah ?? (input.direction === "REVERSE" ? 114 : 1),
        teacherId: actor.teacherId,
        status: "ACTIVE",
        startDate: dayOnly(new Date()),
      },
    });
  });
  await audit(actor.id, "plan.create", "LearningPlan", plan.id);
  return plan;
}

async function tajweedForDay(date: Date) {
  const rules = await systemDb().tajweedRule.findMany({ where: { ...approved() }, orderBy: { sortOrder: "asc" }, select: { slug: true } });
  return rules.length ? rules[Math.floor(date.getTime() / 86400000) % rules.length].slug : undefined;
}

/** Idempotent per student and day: an existing day is returned rather than regenerated. */
export async function generateDay(actor: Actor, studentId: string, dateInput: Date) {
  const date = dayOnly(dateInput);
  const surahs = await systemDb().quranSurah.findMany({ select: { id: true, ayahCount: true } });
  const tajweedSlug = await tajweedForDay(date);
  // Students may not insert arbitrary tasks under RLS, so this server-computed day is written by
  // the system role, after checking the actor is the student or a teacher who can see them.
  const allowed = actor.studentId === studentId || (actor.perms.has("plans.manage") && (await withActor(actor, (tx) => tx.student.count({ where: { id: studentId } }))) > 0);
  if (!allowed) throw forbidden();
  return systemDb().$transaction(async (tx) => {
    // The row lock makes concurrent requests for the same day safe.
    await tx.$queryRaw`SELECT id FROM learning_plans WHERE "studentId" = ${studentId} AND status = 'ACTIVE' FOR UPDATE`;
    const plan = await tx.learningPlan.findFirst({ where: { studentId, status: "ACTIVE" } });
    if (!plan) throw conflict("no_active_plan");
    const existing = await tx.dailyTask.findMany({ where: { studentId, date, planId: plan.id }, orderBy: { sortOrder: "asc" } });
    if (existing.length) return existing;
    if (!plan.studyDays.includes(date.getUTCDay())) return [];

    const due = await tx.memorizationRecord.findMany({ where: { studentId, status: "APPROVED", nextReviewAt: { lte: date } } });
    const recent = await tx.memorizationRecord.findMany({
      where: { studentId, status: "APPROVED", approvedAt: { gte: addDays(date, -14) } },
      select: { id: true },
    });
    const input: PlanInput = {
      dailyMinutes: plan.dailyMinutes,
      newAyahsPerDay: plan.newAyahsPerDay,
      cursorSurah: plan.cursorSurah,
      cursorAyah: plan.cursorAyah,
      direction: plan.direction as PlanInput["direction"],
    };
    const tasks = suggestDay({
      plan: input,
      surahs,
      due: due.map((d) => ({ id: d.id, surahId: d.surahId, fromAyah: d.fromAyah, toAyah: d.toAyah, nextReviewAt: d.nextReviewAt! })),
      recentIds: new Set(recent.map((r) => r.id)),
      tajweedSlug,
    });
    const created = [];
    for (const t of tasks) {
      created.push(await tx.dailyTask.create({ data: { ...t, studentId, planId: plan.id, date, createdById: actor.id } }));
    }
    const fresh = tasks.find((t) => t.type === "NEW_MEMORIZATION");
    if (fresh?.toAyah) await tx.learningPlan.update({ where: { id: plan.id }, data: advanceCursor(input, surahs, fresh.toAyah) });
    return created;
  });
}

export const taskSchema = z.object({
  studentIds: z.array(z.string().min(1)).min(1).max(200),
  date: z.coerce.date(),
  type: z.enum(["NEW_MEMORIZATION", "NEAR_REVISION", "FAR_REVISION", "LISTENING", "RECITATION", "TAJWEED", "TAFSIR"]),
  surahId: z.coerce.number().int().min(1).max(114).optional(),
  fromAyah: z.coerce.number().int().min(1).optional(),
  toAyah: z.coerce.number().int().min(1).optional(),
  ruleSlug: z.string().max(80).optional(),
  suggestedMinutes: z.coerce.number().int().min(1).max(240).default(10),
  teacherNote: z.string().trim().max(500).optional(),
}).refine((t) => !t.fromAyah || !t.toAyah || t.toAyah >= t.fromAyah, "toAyah must not precede fromAyah");

async function assertAyahRange(surahId?: number, from?: number, to?: number) {
  if (!surahId) return;
  const s = await systemDb().quranSurah.findUnique({ where: { id: surahId } });
  if (!s || (from && from > s.ayahCount) || (to && to > s.ayahCount)) throw badRequest("ayah_out_of_range");
}

/** Works individually or for a whole group. RLS rejects any student outside the teacher's scope. */
export async function assignTasks(actor: Actor, input: z.infer<typeof taskSchema>) {
  await assertAyahRange(input.surahId, input.fromAyah, input.toAyah);
  const { studentIds, date, ...rest } = input;
  const created = await withActor(actor, async (tx) => {
    const out = [];
    for (const studentId of studentIds) {
      out.push(await tx.dailyTask.create({ data: { ...rest, studentId, date: dayOnly(date), createdById: actor.id } }));
    }
    return out;
  });
  await audit(actor.id, "task.assign", "DailyTask", null, { count: created.length });
  const users = await systemDb().student.findMany({ where: { id: { in: studentIds } }, select: { userId: true } });
  await notify(users.map((u) => u.userId), "task.assigned", {}, "/student");
  return created;
}

export async function updateTask(actor: Actor, id: string, input: { status?: "PENDING" | "IN_PROGRESS" | "DONE" | "SKIPPED"; teacherNote?: string }) {
  return withActor(actor, async (tx) => {
    const t = await tx.dailyTask.findUnique({ where: { id } });
    if (!t) throw notFound();
    if (t.status === "CARRIED_OVER") throw conflict("task_carried_over");
    const isSelf = actor.studentId === t.studentId;
    if (input.teacherNote !== undefined && isSelf) throw forbidden();
    const updated = await tx.dailyTask.update({
      where: { id },
      data: { ...input, completedAt: input.status === "DONE" ? new Date() : input.status ? null : undefined },
    });
    if (input.status === "DONE" && t.type === "NEW_MEMORIZATION" && t.surahId && t.fromAyah && t.toAyah) {
      // Marks the student's own progress. Only a teacher's review can mark it APPROVED.
      await tx.memorizationRecord.upsert({
        where: { studentId_surahId_fromAyah_toAyah: { studentId: t.studentId, surahId: t.surahId, fromAyah: t.fromAyah, toAyah: t.toAyah } },
        update: {},
        create: { studentId: t.studentId, surahId: t.surahId, fromAyah: t.fromAyah, toAyah: t.toAyah, status: "IN_PROGRESS" },
      });
    }
    return updated;
  });
}

/** Moves unfinished work forward: the original stays as history, and a linked copy is created. */
export async function carryOver(tx: Tx, task: { id: string; status: string; studentId: string; planId: string | null; type: never | string; surahId: number | null; fromAyah: number | null; toAyah: number | null; ruleSlug: string | null; suggestedMinutes: number; sortOrder: number; teacherNote: string | null; revisionOfId: string | null; createdById: string | null }, to: Date) {
  if (!["PENDING", "IN_PROGRESS"].includes(task.status)) throw conflict("task_not_open");
  await tx.dailyTask.update({ where: { id: task.id }, data: { status: "CARRIED_OVER" } });
  return tx.dailyTask.create({
    data: {
      studentId: task.studentId,
      planId: task.planId,
      date: dayOnly(to),
      type: task.type as never,
      surahId: task.surahId,
      fromAyah: task.fromAyah,
      toAyah: task.toAyah,
      ruleSlug: task.ruleSlug,
      suggestedMinutes: task.suggestedMinutes,
      sortOrder: task.sortOrder,
      teacherNote: task.teacherNote,
      revisionOfId: task.revisionOfId,
      createdById: task.createdById,
      carriedFromId: task.id,
    },
  });
}

export const rescheduleTask = (actor: Actor, id: string, to: Date) =>
  withActor(actor, async (tx) => {
    const t = await tx.dailyTask.findUnique({ where: { id } });
    if (!t) throw notFound();
    return carryOver(tx, t, to);
  });

/** Keeps the ayah map in step with recitation decisions, which only a teacher can make final. */
async function markAyahs(studentId: string, surahId: number, from: number, to: number, status: "RECITED" | "MASTERED" | "NEEDS_REVIEW", by: string) {
  const db = systemDb();
  const ayahs = await db.quranAyah.findMany({ where: { surahId, ayahNumber: { gte: from, lte: to } }, select: { id: true } });
  for (const { id: ayahId } of ayahs) {
    await db.ayahProgress.upsert({ where: { studentId_ayahId: { studentId, ayahId } }, update: { status, updatedById: by }, create: { studentId, ayahId, status, updatedById: by } });
  }
}

// ---------- Recitation submissions ----------

export async function submitRecitation(actor: Actor, form: { studentId?: string; taskId?: string; surahId: number; fromAyah: number; toAyah: number; note?: string; consent: boolean; file: File }) {
  const studentId = actor.studentId;
  if (!studentId) throw forbidden();
  if (!form.consent) throw badRequest("consent_required");
  await assertAyahRange(form.surahId, form.fromAyah, form.toAyah);
  if (form.toAyah < form.fromAyah) throw badRequest("invalid_range");
  if (form.file.size > MAX_AUDIO_BYTES) throw badRequest("file_too_large");
  if (form.file.size === 0) throw badRequest("file_empty");
  const student = await systemDb().student.findUniqueOrThrow({ where: { id: studentId } });
  if (student.isMinor && !student.recordingConsentAt) throw conflict("guardian_consent_required");

  const buffer = Buffer.from(await form.file.arrayBuffer());
  const mime = sniffAudio(buffer);
  if (!mime) throw badRequest("unsupported_audio_type");
  const storageKey = `recitations/${studentId}/${randomUUID()}`;
  await putObject(storageKey, buffer, mime);

  const submission = await withActor(actor, async (tx) => {
    const file = await tx.file.create({
      data: { ownerId: actor.id, kind: "RECITATION", storageKey, mime, size: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex") },
    });
    return tx.recitationSubmission.create({
      data: {
        studentId, taskId: form.taskId, surahId: form.surahId, fromAyah: form.fromAyah, toAyah: form.toAyah, note: form.note,
        fileId: file.id, consentGivenBy: student.isMinor ? (student.recordingConsentBy ?? "guardian") : actor.id,
        deleteAfter: addDays(new Date(), env.recordingRetentionDays),
      },
    });
  });
  await audit(actor.id, "recitation.submit", "RecitationSubmission", submission.id);
  await markAyahs(studentId, form.surahId, form.fromAyah, form.toAyah, "RECITED", actor.id);
  const teachers = await systemDb().enrollment.findMany({
    where: { studentId, status: "ACTIVE" },
    select: { halaqa: { select: { teacher: { select: { userId: true } } } } },
  });
  const ids = teachers.map((t) => t.halaqa.teacher?.userId).filter(Boolean) as string[];
  if (ids.length) await notify(ids, "recitation.submitted", {}, "/teacher/reviews");
  return submission;
}

/** RLS decides visibility; the signed URL is issued only after this read succeeds. */
export async function recitationAudioUrl(actor: Actor, submissionId: string) {
  const s = await withActor(actor, (tx) => tx.recitationSubmission.findUnique({ where: { id: submissionId }, include: { file: true } }));
  if (!s?.file || s.file.deletedAt || s.status === "DELETED") throw notFound();
  await audit(actor.id, "recitation.listen", "RecitationSubmission", submissionId);
  return { url: await signedGetUrl(s.file.storageKey), mime: s.file.mime };
}

export async function deleteRecitation(actor: Actor, submissionId: string) {
  const s = await withActor(actor, async (tx) => {
    const r = await tx.recitationSubmission.findUnique({ where: { id: submissionId }, include: { file: true } });
    if (!r) throw notFound();
    await tx.recitationSubmission.update({ where: { id: submissionId }, data: { status: "DELETED" } });
    if (r.fileId) await tx.file.update({ where: { id: r.fileId }, data: { deletedAt: new Date() } }).catch(() => undefined);
    return r;
  });
  if (s.file) await deleteObject(s.file.storageKey);
  await audit(actor.id, "recitation.delete", "RecitationSubmission", submissionId);
}

// ---------- Teacher review ----------

const score = z.coerce.number().int().min(1).max(5);
export const reviewSchema = z.object({
  memorizationScore: score,
  tajweedScore: score,
  fluencyScore: score,
  revisionScore: score,
  decision: z.enum(["APPROVED", "RESUBMIT"]),
  note: z.string().trim().max(1000).optional(),
  mistakes: z.array(z.object({
    ayah: z.coerce.number().int().min(1).optional(),
    category: z.enum(["memorization", "tajweed", "fluency", "makharij", "waqf"]),
    note: z.string().trim().max(300),
  })).max(50).default([]),
});

/** Approval is always this explicit human action; nothing automated reaches this state. */
export async function reviewSubmission(actor: Actor, submissionId: string, input: z.infer<typeof reviewSchema>) {
  if (!actor.teacherId) throw forbidden();
  const teacherId = actor.teacherId;
  const { sub, review } = await withActor(actor, async (tx) => {
    const sub = await tx.recitationSubmission.findUnique({ where: { id: submissionId } });
    if (!sub) throw notFound();
    if (sub.status === "DELETED") throw conflict("submission_deleted");
    const review = await tx.teacherReview.create({
      data: { ...input, submissionId, studentId: sub.studentId, teacherId },
    });
    await tx.recitationSubmission.update({ where: { id: submissionId }, data: { status: input.decision === "APPROVED" ? "APPROVED" : "RESUBMIT" } });
    const key = { studentId_surahId_fromAyah_toAyah: { studentId: sub.studentId, surahId: sub.surahId, fromAyah: sub.fromAyah, toAyah: sub.toAyah } };
    if (input.decision === "APPROVED") {
      const state = nextReview({ ease: 2.5, intervalDays: 1, repetitions: 0 }, input.memorizationScore);
      await tx.memorizationRecord.upsert({
        where: key,
        update: { status: "APPROVED", approvedById: actor.id, approvedAt: new Date(), ...state, nextReviewAt: addDays(new Date(), state.intervalDays) },
        create: { studentId: sub.studentId, surahId: sub.surahId, fromAyah: sub.fromAyah, toAyah: sub.toAyah, status: "APPROVED", approvedById: actor.id, approvedAt: new Date(), ...state, nextReviewAt: addDays(new Date(), state.intervalDays) },
      });
    } else {
      await tx.memorizationRecord.upsert({
        where: key,
        update: { status: "NEEDS_RETRY" },
        create: { studentId: sub.studentId, surahId: sub.surahId, fromAyah: sub.fromAyah, toAyah: sub.toAyah, status: "NEEDS_RETRY" },
      });
    }
    return { sub, review };
  });
  await audit(actor.id, "review.create", "TeacherReview", review.id, { decision: input.decision });
  await markAyahs(sub.studentId, sub.surahId, sub.fromAyah, sub.toAyah, input.decision === "APPROVED" ? "MASTERED" : "NEEDS_REVIEW", actor.id);
  const aud = await studentAudience(sub.studentId);
  await notify([...aud.student, ...aud.guardians], input.decision === "APPROVED" ? "review.approved" : "review.resubmit", {}, "/student/recitations");
  await awardMilestones(sub.studentId);
  return review;
}

export const gradeRevisionSchema = z.object({
  quality: z.coerce.number().int().min(1).max(5),
  overrideDays: z.coerce.number().int().min(1).max(365).optional(),
  taskId: z.string().optional(),
});

/** A graded revision moves the next due date; the teacher may override the computed interval. */
export async function gradeRevision(actor: Actor, memorizationId: string, input: z.infer<typeof gradeRevisionSchema>) {
  const rec = await withActor(actor, async (tx) => {
    const m = await tx.memorizationRecord.findUnique({ where: { id: memorizationId } });
    if (!m) throw notFound();
    const state = nextReview({ ease: m.ease, intervalDays: m.intervalDays, repetitions: m.repetitions }, input.quality, input.overrideDays);
    const dueAfter = addDays(new Date(), state.intervalDays);
    await tx.memorizationRecord.update({ where: { id: m.id }, data: { ...state, nextReviewAt: dueAfter } });
    if (input.taskId) await tx.dailyTask.update({ where: { id: input.taskId }, data: { status: "DONE", completedAt: new Date() } });
    return tx.revisionRecord.create({
      data: {
        studentId: m.studentId, memorizationId: m.id, quality: input.quality, intervalBefore: m.intervalDays,
        intervalAfter: state.intervalDays, dueAfter, overridden: input.overrideDays !== undefined, gradedById: actor.id,
      },
    });
  });
  await audit(actor.id, "revision.grade", "RevisionRecord", rec.id, { overridden: rec.overridden });
  const m = await systemDb().memorizationRecord.findUniqueOrThrow({ where: { id: memorizationId } });
  await markAyahs(m.studentId, m.surahId, m.fromAyah, m.toAyah, input.quality < 3 ? "NEEDS_REVIEW" : "MASTERED", actor.id);
  return rec;
}

/** Modest, record-based milestones. Awarded from approved work only. */
async function awardMilestones(studentId: string) {
  const db = systemDb();
  const approved = await db.memorizationRecord.count({ where: { studentId, status: "APPROVED" } });
  const keys = [approved >= 1 ? "first_approved" : null, approved >= 10 ? "ten_approved" : null].filter(Boolean) as string[];
  if (!keys.length) return;
  const badges = await db.badge.findMany({ where: { key: { in: keys } } });
  await db.studentBadge.createMany({ data: badges.map((b) => ({ studentId, badgeId: b.id })), skipDuplicates: true });
}

// ---------- Progress, computed only from records ----------

export const studentProgress = (actor: Actor, studentId: string) =>
  withActor(actor, async (tx) => {
    const [mem, tasks, attendance, reviews, revisions, badges] = await Promise.all([
      tx.memorizationRecord.findMany({ where: { studentId } }),
      tx.dailyTask.findMany({ where: { studentId }, select: { status: true, type: true, date: true } }),
      tx.attendance.findMany({ where: { studentId }, select: { status: true } }),
      tx.teacherReview.findMany({ where: { studentId }, orderBy: { createdAt: "desc" }, take: 60, include: { submission: { select: { surahId: true } } } }),
      tx.revisionRecord.findMany({ where: { studentId }, orderBy: { createdAt: "desc" }, take: 30, select: { quality: true } }),
      tx.studentBadge.findMany({ where: { studentId }, include: { badge: true } }),
    ]);
    return summarizeProgress({ mem, tasks, attendance, reviews, revisions, badges });
  });

export function summarizeProgress(d: {
  mem: { status: string; surahId: number; fromAyah: number; toAyah: number }[];
  tasks: { status: string }[];
  attendance: { status: string }[];
  reviews: { memorizationScore: number; tajweedScore: number; fluencyScore: number; revisionScore: number; mistakes: unknown; createdAt?: Date; submission?: { surahId: number } | null }[];
  revisions: { quality: number }[];
  badges: { badge: { key: string; nameAr: string; nameEn: string } }[];
}) {
  // Overlapping approved ranges must not be counted twice.
  const seen = new Set<string>();
  for (const m of d.mem.filter((x) => x.status === "APPROVED")) for (let a = m.fromAyah; a <= m.toAyah; a++) seen.add(`${m.surahId}:${a}`);
  const counted = d.tasks.filter((t) => t.status !== "CARRIED_OVER");
  const held = d.attendance.filter((a) => a.status !== "EXCUSED");
  const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : null);
  const avg = (ns: number[]) => (ns.length ? Number((ns.reduce((a, b) => a + b, 0) / ns.length).toFixed(1)) : null);
  const weak: Record<string, number> = {};
  for (const r of d.reviews) {
    for (const m of (r.mistakes as { category: string }[]) ?? []) weak[m.category] = (weak[m.category] ?? 0) + 1;
  }
  // Ayahs a teacher noted, and monthly rubric average, to show development over time.
  const noted: Record<string, number> = {};
  const months: Record<string, number[]> = {};
  for (const r of d.reviews) {
    for (const m of (r.mistakes as { ayah?: number }[]) ?? []) if (m.ayah && r.submission) noted[`${r.submission.surahId}:${m.ayah}`] = (noted[`${r.submission.surahId}:${m.ayah}`] ?? 0) + 1;
    if (r.createdAt) (months[r.createdAt.toISOString().slice(0, 7)] ??= []).push((r.memorizationScore + r.tajweedScore + r.fluencyScore + r.revisionScore) / 4);
  }
  return {
    ayahsToReview: Object.entries(noted).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([key, count]) => ({ key, count })),
    trend: Object.entries(months).sort().map(([month, v]) => ({ month, average: avg(v)! })),
    ayahsApproved: seen.size,
    ayahsTotal: 6236,
    tasksDonePercent: pct(counted.filter((t) => t.status === "DONE").length, counted.length),
    tasksCounted: counted.length,
    attendancePercent: pct(held.filter((a) => a.status === "PRESENT" || a.status === "LATE").length, held.length),
    sessionsCounted: held.length,
    revisionMastery: avg(d.revisions.map((r) => r.quality)),
    rubric: {
      memorization: avg(d.reviews.map((r) => r.memorizationScore)),
      tajweed: avg(d.reviews.map((r) => r.tajweedScore)),
      fluency: avg(d.reviews.map((r) => r.fluencyScore)),
      revision: avg(d.reviews.map((r) => r.revisionScore)),
    },
    weakAreas: Object.entries(weak).sort((a, b) => b[1] - a[1]).map(([category, count]) => ({ category, count })),
    badges: d.badges.map((b) => b.badge),
  };
}
