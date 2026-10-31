// The shared student record: hadith, placement and skills, competitions, ayah progress and study.
import { randomInt, randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { systemDb, withActor } from "@/lib/db";
import { env } from "@/lib/env";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { MAX_AUDIO_BYTES, putObject, signedGetUrl, sniffAudio } from "@/lib/storage";
import type { Actor } from "@/lib/session";
import { gradeObjective, scoreAttempt } from "../assessments/service";
import { addDays, dayOnly, nextReview } from "../learning/srs";
import { notify, studentAudience } from "../notifications/service";
import { approved } from "@/lib/scholarly";
import { notDemoRow } from "@/lib/scholarly";

// ---------- Authorization helpers ----------

export async function canTeach(actor: Actor, studentId: string) {
  const rows = await withActor(actor, (tx) => tx.$queryRaw<{ ok: boolean }[]>`SELECT app.can_teach_student(${studentId}) AS ok`);
  return rows[0].ok;
}
async function assertTeaches(actor: Actor, studentId: string) {
  if (!(await canTeach(actor, studentId))) throw forbidden();
}
const needStudent = (actor: Actor) => {
  if (!actor.studentId) throw forbidden();
  return actor.studentId;
};

/** Stores validated private audio. Minors need guardian consent first. */
export async function storeAudio(actor: Actor, file: File, folder: string) {
  const studentId = needStudent(actor);
  if (file.size === 0) throw badRequest("file_empty");
  if (file.size > MAX_AUDIO_BYTES) throw badRequest("file_too_large");
  const student = await systemDb().student.findUniqueOrThrow({ where: { id: studentId } });
  if (student.isMinor && !student.recordingConsentAt) throw conflict("guardian_consent_required");
  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = sniffAudio(buffer);
  if (!mime) throw badRequest("unsupported_audio_type");
  const storageKey = `${folder}/${studentId}/${randomUUID()}`;
  await putObject(storageKey, buffer, mime);
  const row = await systemDb().file.create({ data: { ownerId: actor.id, kind: "RECITATION", storageKey, mime, size: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex") } });
  return { fileId: row.id, consentGivenBy: student.isMinor ? (student.recordingConsentBy ?? "guardian") : actor.id };
}

async function fileUrl(actor: Actor, fileId: string | null, studentId: string, action: string) {
  if (!fileId) throw notFound();
  const allowed = actor.studentId === studentId || (await canTeach(actor, studentId));
  if (!allowed) throw notFound();
  const f = await systemDb().file.findUnique({ where: { id: fileId } });
  if (!f || f.deletedAt) throw notFound();
  await audit(actor.id, action, "File", fileId);
  return { url: await signedGetUrl(f.storageKey), mime: f.mime };
}

// ---------- Ayah-level progress ----------

const SELF_STATUS = ["NOT_STARTED", "PRACTICING", "READY"] as const;

async function ayahIds(surahId: number, from: number, to: number) {
  const rows = await systemDb().quranAyah.findMany({ where: { surahId, ayahNumber: { gte: from, lte: to } }, select: { id: true } });
  return rows.map((r) => r.id);
}

export async function setAyahStatus(tx: { ayahProgress: ReturnType<typeof systemDb>["ayahProgress"] }, studentId: string, ids: number[], status: never | string, by: string) {
  for (const ayahId of ids) {
    await tx.ayahProgress.upsert({ where: { studentId_ayahId: { studentId, ayahId } }, update: { status: status as never, updatedById: by }, create: { studentId, ayahId, status: status as never, updatedById: by } });
  }
}

export const ayahStatusSchema = z.object({
  surahId: z.coerce.number().int().min(1).max(114), fromAyah: z.coerce.number().int().min(1), toAyah: z.coerce.number().int().min(1),
  status: z.enum(["NOT_STARTED", "PRACTICING", "READY", "RECITED", "NEEDS_REVIEW", "MASTERED"]),
  studentId: z.string().optional(),
});

/** Students manage their own practice states. Recited, review and mastered come from a teacher. */
export async function updateAyahRange(actor: Actor, input: z.infer<typeof ayahStatusSchema>) {
  const studentId = input.studentId ?? needStudent(actor);
  const self = studentId === actor.studentId;
  if (self && !(SELF_STATUS as readonly string[]).includes(input.status)) throw forbidden();
  if (!self) await assertTeaches(actor, studentId);
  const ids = await ayahIds(input.surahId, input.fromAyah, input.toAyah);
  if (!ids.length) throw badRequest("ayah_out_of_range");
  const db = systemDb();
  // A student's practice update never overwrites what a teacher has recorded.
  const locked = self ? new Set((await db.ayahProgress.findMany({ where: { studentId, ayahId: { in: ids }, status: { in: ["RECITED", "NEEDS_REVIEW", "MASTERED"] } }, select: { ayahId: true } })).map((r) => r.ayahId)) : new Set<number>();
  await setAyahStatus(db, studentId, ids.filter((i) => !locked.has(i)), input.status, actor.id);
  if (!self) await audit(actor.id, "ayah.status", "Student", studentId, { status: input.status, count: ids.length });
  return { updated: ids.length - locked.size };
}

export const surahMap = (actor: Actor, studentId: string) =>
  withActor(actor, async (tx) => {
    const rows = await tx.ayahProgress.findMany({ where: { studentId }, select: { status: true, ayah: { select: { surahId: true, ayahNumber: true } } } });
    const out: Record<number, Record<string, number>> = {};
    for (const r of rows) ((out[r.ayah.surahId] ??= {})[r.status] = (out[r.ayah.surahId]?.[r.status] ?? 0) + 1);
    return { summary: out, rows: rows.map((r) => ({ surahId: r.ayah.surahId, ayah: r.ayah.ayahNumber, status: r.status })) };
  });

// ---------- Smart revision ----------

type RevisionInput = { nextReviewAt: Date | null; intervalDays?: number; ease: number; repetitions: number; ayahCount: number; lastQuality: number | null; recentFailures?: number; difficulty?: number | null };
export type RevisionReason = "overdue" | "weak_results" | "recent_failure" | "new_segment" | "long_segment" | "teacher_difficulty";

/**
 * Orders revision by how overdue a segment is relative to its own interval, past results, recency and the
 * teacher's difficulty rating. It proposes an order with its reasons; teachers set real dates through graded revisions.
 */
export function revisionPlan(m: RevisionInput, now = new Date()) {
  const lateDays = m.nextReviewAt ? Math.max(0, (now.getTime() - m.nextReviewAt.getTime()) / 86400000) : 0;
  // Three days late matters more on a two-day interval than on a sixty-day one.
  const overdue = lateDays * 2 * Math.min(2, 1 + 3 / Math.max(3, m.intervalDays ?? 3));
  const weak = (2.5 - m.ease) * 4;
  const failed = (m.lastQuality !== null && m.lastQuality < 3 ? 6 : 0) + (m.recentFailures ?? 0) * 2;
  const newness = m.repetitions < 2 ? 2 : 0;
  const length = Math.min(3, m.ayahCount / 20);
  const hard = m.difficulty ? (m.difficulty - 3) * 1.5 : 0;
  const reasons: RevisionReason[] = [];
  if (lateDays >= 1) reasons.push("overdue");
  if (weak >= 1) reasons.push("weak_results");
  if (failed > 0) reasons.push("recent_failure");
  if (newness) reasons.push("new_segment");
  if (length >= 1) reasons.push("long_segment");
  if (hard > 0) reasons.push("teacher_difficulty");
  return { score: Math.round((overdue + weak + failed + newness + length + hard) * 10) / 10, reasons };
}
export const revisionPriority = (m: RevisionInput, now = new Date()) => revisionPlan(m, now).score;

/** A student's own indicator from results: the teacher's rating is what the system stores. */
export function suggestDifficulty(ease: number, failures: number) {
  if (ease < 1.6 || failures >= 3) return 5;
  if (ease < 2 || failures === 2) return 4;
  if (ease < 2.4 || failures === 1) return 3;
  return ease >= 2.7 ? 1 : 2;
}

export const revisionQueue = (actor: Actor, studentId: string) =>
  withActor(actor, async (tx) => {
    const mem = await tx.memorizationRecord.findMany({ where: { studentId, status: "APPROVED" }, include: { revisions: { orderBy: { createdAt: "desc" }, take: 5, select: { quality: true } } } });
    return mem
      .map((m) => {
        const failures = m.revisions.filter((r) => r.quality < 3).length;
        const plan = revisionPlan({ nextReviewAt: m.nextReviewAt, intervalDays: m.intervalDays, ease: m.ease, repetitions: m.repetitions, ayahCount: m.toAyah - m.fromAyah + 1, lastQuality: m.revisions[0]?.quality ?? null, recentFailures: failures, difficulty: m.difficulty });
        return { id: m.id, surahId: m.surahId, fromAyah: m.fromAyah, toAyah: m.toAyah, nextReviewAt: m.nextReviewAt, difficulty: m.difficulty, difficultyNote: m.difficultyNote, suggestedDifficulty: suggestDifficulty(m.ease, failures), ...plan };
      })
      .sort((a, b) => b.score - a.score);
  });

export const difficultySchema = z.object({ difficulty: z.coerce.number().int().min(1).max(5), note: z.string().trim().max(500).optional() });

/** Teaching difficulty is the teacher's judgement, kept apart from the spaced repetition numbers. */
export async function setSegmentDifficulty(actor: Actor, memorizationId: string, input: z.infer<typeof difficultySchema>) {
  const db = systemDb();
  const m = await db.memorizationRecord.findUnique({ where: { id: memorizationId } });
  if (!m) throw notFound();
  await assertTeaches(actor, m.studentId);
  await db.memorizationRecord.update({ where: { id: memorizationId }, data: { difficulty: input.difficulty, difficultyNote: input.note, difficultySetById: actor.id, difficultySetAt: new Date() } });
  await audit(actor.id, "memorization.difficulty", "MemorizationRecord", memorizationId, { difficulty: input.difficulty });
}

// ---------- Reports ----------

/** Counts only ayahs a teacher marked mastered, against what the plan's pace asked for in the period. */
export function actualMemorization(rows: { juz: number; page: number; at: Date }[], plan: { newAyahsPerDay: number; studyDays: number[]; startDate: Date } | null, since: Date, now = new Date()) {
  const inPeriod = rows.filter((r) => r.at >= since).length;
  let planned: number | null = null;
  if (plan) {
    const from = plan.startDate > since ? plan.startDate : since;
    let days = 0;
    for (let d = dayOnly(from); d <= now; d = addDays(d, 1)) if (plan.studyDays.includes(d.getUTCDay())) days += 1;
    planned = days * plan.newAyahsPerDay;
  }
  return { totalAyahs: rows.length, pages: new Set(rows.map((r) => r.page)).size, juzTouched: new Set(rows.map((r) => r.juz)).size, inPeriod, planned };
}

export const learningReport = (actor: Actor, studentId: string, period: "day" | "week" | "month") =>
  withActor(actor, async (tx) => {
    const days = period === "day" ? 1 : period === "week" ? 7 : 30;
    const since = addDays(dayOnly(new Date()), -(days - 1));
    const [tasks, reviews, revisions, attendance, progress, hadith, plan, juzRows] = await Promise.all([
      tx.dailyTask.findMany({ where: { studentId, date: { gte: since } }, select: { status: true, type: true } }),
      tx.teacherReview.findMany({ where: { studentId, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, include: { submission: { select: { surahId: true, fromAyah: true, toAyah: true } } } }),
      tx.revisionRecord.findMany({ where: { studentId, createdAt: { gte: since } }, select: { quality: true } }),
      tx.attendance.findMany({ where: { studentId, recordedAt: { gte: since } }, select: { status: true } }),
      tx.ayahProgress.findMany({ where: { studentId }, select: { status: true, ayah: { select: { surahId: true } } } }),
      tx.hadithMemorization.groupBy({ by: ["status"], where: { studentId }, _count: true }),
      tx.learningPlan.findFirst({ where: { studentId, status: "ACTIVE" }, select: { newAyahsPerDay: true, studyDays: true, startDate: true } }),
      tx.ayahProgress.findMany({ where: { studentId, status: "MASTERED" }, select: { ayah: { select: { juz: true, page: true } }, updatedAt: true } }),
    ]);
    const bySurah: Record<number, Record<string, number>> = {};
    for (const p of progress) ((bySurah[p.ayah.surahId] ??= {})[p.status] = (bySurah[p.ayah.surahId]?.[p.status] ?? 0) + 1);
    const counted = tasks.filter((t) => t.status !== "CARRIED_OVER");
    const mastery: Record<string, number> = {};
    for (const p of progress) mastery[p.status] = (mastery[p.status] ?? 0) + 1;
    return {
      period, since,
      tasksDone: counted.filter((t) => t.status === "DONE").length, tasksTotal: counted.length,
      recitations: reviews.map((r) => ({ id: r.id, date: r.createdAt, surahId: r.submission?.surahId ?? null, fromAyah: r.submission?.fromAyah ?? null, toAyah: r.submission?.toAyah ?? null, decision: r.decision, note: r.note, memorization: r.memorizationScore, tajweed: r.tajweedScore })),
      revisionCount: revisions.length,
      revisionAverage: revisions.length ? Math.round((revisions.reduce((n, r) => n + r.quality, 0) / revisions.length) * 10) / 10 : null,
      attendance: { present: attendance.filter((a) => a.status === "PRESENT" || a.status === "LATE").length, absent: attendance.filter((a) => a.status === "ABSENT").length },
      actual: actualMemorization(juzRows.map((r) => ({ juz: r.ayah.juz, page: r.ayah.page, at: r.updatedAt })), plan, since),
      bySurah, mastery, hadith: hadith.map((h) => ({ status: h.status, count: h._count })),
    };
  });

// ---------- Hadith ----------

export const startHadith = async (actor: Actor, hadithId: string) => {
  const studentId = needStudent(actor);
  const h = await systemDb().hadithEntry.findFirst({ where: { id: hadithId, ...approved() }, select: { id: true } });
  if (!h) throw notFound();
  return systemDb().hadithMemorization.upsert({ where: { studentId_hadithId: { studentId, hadithId } }, update: {}, create: { studentId, hadithId, status: "PRACTICING" } });
};

export const assignHadithSchema = z.object({ studentIds: z.array(z.string()).min(1).max(200), hadithIds: z.array(z.string()).min(1).max(42), reciteBy: z.coerce.date().optional() });

export async function assignHadith(actor: Actor, input: z.infer<typeof assignHadithSchema>) {
  if (!actor.perms.has("tasks.assign")) throw forbidden();
  const db = systemDb();
  for (const s of input.studentIds) await assertTeaches(actor, s);
  const good = await db.hadithEntry.count({ where: { id: { in: input.hadithIds }, ...approved() } });
  if (good !== input.hadithIds.length) throw conflict("hadith_not_approved");
  let n = 0;
  for (const studentId of input.studentIds) for (const hadithId of input.hadithIds) {
    await db.hadithMemorization.upsert({ where: { studentId_hadithId: { studentId, hadithId } }, update: { reciteBy: input.reciteBy, assignedById: actor.id }, create: { studentId, hadithId, reciteBy: input.reciteBy, assignedById: actor.id } });
    n += 1;
  }
  for (const s of input.studentIds) {
    const aud = await studentAudience(s);
    await notify(aud.student, "hadith.assigned", {}, "/hadith/my");
  }
  await audit(actor.id, "hadith.assign", "HadithEntry", null, { count: n });
  return { assigned: n };
}

export async function submitHadith(actor: Actor, hadithId: string, consent: boolean, file: File) {
  const studentId = needStudent(actor);
  if (!consent) throw badRequest("consent_required");
  const h = await systemDb().hadithEntry.findFirst({ where: { id: hadithId, ...approved() }, select: { id: true } });
  if (!h) throw notFound();
  const { fileId, consentGivenBy } = await storeAudio(actor, file, "hadith");
  const db = systemDb();
  const sub = await db.hadithSubmission.create({ data: { studentId, hadithId, fileId, consentGivenBy, deleteAfter: addDays(new Date(), env.recordingRetentionDays) } });
  await db.hadithMemorization.upsert({ where: { studentId_hadithId: { studentId, hadithId } }, update: { status: "SUBMITTED" }, create: { studentId, hadithId, status: "SUBMITTED" } });
  await audit(actor.id, "hadith.submit", "HadithSubmission", sub.id);
  return sub;
}

export async function hadithAudio(actor: Actor, id: string) {
  const s = await systemDb().hadithSubmission.findUnique({ where: { id } });
  if (!s || s.status === "DELETED") throw notFound();
  return fileUrl(actor, s.fileId, s.studentId, "hadith.listen");
}

const score = z.coerce.number().int().min(1).max(5);
export const hadithReviewSchema = z.object({ memorizationScore: score, understandingScore: score, decision: z.enum(["APPROVED", "RESUBMIT"]), mistakes: z.string().trim().max(1000).optional(), note: z.string().trim().max(1000).optional() });

/** Mastery is only ever set here, by a teacher's decision. */
export async function reviewHadith(actor: Actor, submissionId: string, input: z.infer<typeof hadithReviewSchema>) {
  if (!actor.teacherId) throw forbidden();
  const db = systemDb();
  const sub = await db.hadithSubmission.findUnique({ where: { id: submissionId } });
  if (!sub) throw notFound();
  await assertTeaches(actor, sub.studentId);
  const m = await db.hadithMemorization.findUniqueOrThrow({ where: { studentId_hadithId: { studentId: sub.studentId, hadithId: sub.hadithId } } });
  const passed = input.decision === "APPROVED";
  const state = passed ? nextReview({ ease: m.ease, intervalDays: m.intervalDays, repetitions: m.repetitions }, input.memorizationScore) : null;
  await db.$transaction([
    db.hadithReview.create({ data: { ...input, memorizationId: m.id, studentId: sub.studentId, teacherId: actor.teacherId } }),
    db.hadithSubmission.update({ where: { id: submissionId }, data: { status: passed ? "APPROVED" : "RESUBMIT" } }),
    db.hadithMemorization.update({ where: { id: m.id }, data: passed ? { status: "MASTERED", approvedById: actor.id, approvedAt: new Date(), ...state!, nextReviewAt: addDays(new Date(), state!.intervalDays) } : { status: "NEEDS_RETRY" } }),
  ]);
  await audit(actor.id, "hadith.review", "HadithSubmission", submissionId, { decision: input.decision });
  const aud = await studentAudience(sub.studentId);
  await notify([...aud.student, ...aud.guardians], passed ? "review.approved" : "review.resubmit", {}, "/hadith/my");
}

export const hadithEditSchema = z.object({
  text: z.string().trim().min(5).max(10000),
  narrator: z.string().trim().max(200).nullable().optional(), sourceRef: z.string().trim().max(300).nullable().optional(), topic: z.string().trim().max(120).nullable().optional(),
  grade: z.string().trim().max(200).nullable().optional(), gradeSource: z.string().trim().max(300).nullable().optional(),
  explanation: z.string().trim().max(10000).nullable().optional(), explanationSource: z.string().trim().max(300).nullable().optional(),
  benefits: z.string().trim().max(4000).nullable().optional(),
  vocabulary: z.array(z.object({ word: z.string().trim().min(1).max(100), meaning: z.string().trim().min(1).max(500) })).max(60).optional(),
}).refine((h) => !h.grade || h.gradeSource, "a grade needs its reference").refine((h) => !h.explanation || h.explanationSource, "an explanation needs its source");

/** Any edit returns the hadith to review. Grades and explanations must name their reference. */
export async function editHadith(actor: Actor, id: string, input: z.infer<typeof hadithEditSchema>) {
  if (!actor.perms.has("content.manage")) throw forbidden();
  const row = await systemDb().hadithEntry.update({ where: { id }, data: { ...input, sha256: createHash("sha256").update(input.text, "utf8").digest("hex"), reviewStatus: "PENDING", reviewedBy: null, reviewedAt: null } });
  await audit(actor.id, "hadith.edit", "HadithEntry", id);
  return row;
}

export async function publishCollection(actor: Actor, id: string, published: boolean) {
  if (!actor.perms.has("scholarly.review")) throw forbidden();
  if (published) {
    // A track is public only when every hadith in it has been reviewed.
    const db = systemDb();
    const [all, good] = await Promise.all([db.hadithEntry.count({ where: { collectionId: id } }), db.hadithEntry.count({ where: { collectionId: id, ...approved() } })]);
    if (!all || all !== good) throw conflict("collection_not_fully_reviewed");
  }
  await systemDb().hadithCollection.update({ where: { id }, data: { published } });
  await audit(actor.id, "hadith.publish", "HadithCollection", id, { published });
}

// ---------- Placement ----------

export const SKILLS = ["reading_accuracy", "reading_fluency", "tajweed_knowledge", "tajweed_application", "memorization", "memorization_retention", "quran_understanding"] as const;
export const TRACKS = ["foundation", "recitation_correction", "memorization_beginner", "memorization_intermediate", "memorization_advanced", "consolidation", "tajweed_mastery", "advanced_exam_prep"] as const;

export const intakeSchema = z.object({
  ageGroup: z.enum(["child", "teen", "adult"]),
  schoolLevel: z.string().trim().max(60).optional(),
  experience: z.enum(["none", "some", "regular"]),
  goal: z.enum(["read", "memorize", "revise", "tajweed"]),
  memorizedJuz: z.coerce.number().int().min(0).max(30),
  memorizedFromSurah: z.coerce.number().int().min(1).max(114).optional(),
  days: z.array(z.coerce.number().int().min(0).max(6)).max(7).default([]),
  timeOfDay: z.enum(["morning", "afternoon", "evening"]).optional(),
  format: z.enum(["individual", "group", "either"]),
});

export const getPlacement = async (actor: Actor) => {
  const studentId = needStudent(actor);
  const db = systemDb();
  const latest = await db.placementAssessment.findFirst({ where: { studentId }, orderBy: { createdAt: "desc" } });
  return latest ?? db.placementAssessment.create({ data: { studentId } });
};

export const startNewPlacement = (actor: Actor) => systemDb().placementAssessment.create({ data: { studentId: needStudent(actor) } });

/** Records only that the unscored practice run happened. Answers and test recordings never reach the server. */
export async function completePractice(actor: Actor) {
  const p = await getPlacement(actor);
  if (p.status !== "DRAFT") throw conflict("placement_submitted");
  await systemDb().placementAssessment.update({ where: { id: p.id }, data: { practiceCompletedAt: new Date() } });
}

/** Practice uses the stored opening surah, so no text is authored for it. It carries no score. */
export const practiceItems = async () => {
  const ayahs = await systemDb().quranAyah.findMany({ where: { surahId: 1 }, orderBy: { ayahNumber: "asc" }, take: 4, select: { id: true, ayahNumber: true, text: true } });
  return ayahs;
};

/** Saves a draft from any stage, so a student can leave and return. */
export async function saveIntake(actor: Actor, input: z.infer<typeof intakeSchema>) {
  const p = await getPlacement(actor);
  if (p.status !== "DRAFT") throw conflict("placement_submitted");
  return systemDb().placementAssessment.update({ where: { id: p.id }, data: { intake: input, stage: Math.max(p.stage, 2) } });
}

export async function savePlacementAudio(actor: Actor, stage: "reading" | "memorization", consent: boolean, file: File) {
  if (!consent) throw badRequest("consent_required");
  const p = await getPlacement(actor);
  if (p.status !== "DRAFT") throw conflict("placement_submitted");
  const { fileId } = await storeAudio(actor, file, "placement");
  return systemDb().placementAssessment.update({ where: { id: p.id }, data: stage === "reading" ? { readingFileId: fileId, stage: Math.max(p.stage, 3) } : { memorizationFileId: fileId, stage: Math.max(p.stage, 5) } });
}

/** Questions tagged placement. Correct answers stay on the server. */
export const placementQuestions = () =>
  systemDb().question.findMany({ where: { active: true, ...notDemoRow(), kind: "TAJWEED", tag: { startsWith: "placement" } }, orderBy: [{ level: "asc" }, { createdAt: "asc" }], select: { id: true, type: true, level: true, promptAr: true, promptEn: true, options: true } });

export async function savePlacementTajweed(actor: Actor, answers: Record<string, string>) {
  const p = await getPlacement(actor);
  if (p.status !== "DRAFT") throw conflict("placement_submitted");
  const qs = await systemDb().question.findMany({ where: { active: true, ...notDemoRow(), kind: "TAJWEED", tag: { startsWith: "placement" } } });
  const gradable = qs.filter((q) => q.type === "MULTIPLE_CHOICE" || q.type === "TRUE_FALSE");
  const right = gradable.filter((q) => answers[q.id] === q.correctKey).length;
  return systemDb().placementAssessment.update({ where: { id: p.id }, data: { tajweedAnswers: answers, tajweedPercent: gradable.length ? Math.round((right / gradable.length) * 100) : null, stage: Math.max(p.stage, 4) } });
}

/** Builds memorization checks from stored ayahs. Nothing is written by hand or generated. */
export async function memorizationCheck(surahId: number) {
  const ayahs = await systemDb().quranAyah.findMany({ where: { surahId }, orderBy: { ayahNumber: "asc" }, select: { id: true, ayahNumber: true, text: true } });
  const pool = ayahs.slice(0, Math.min(ayahs.length, 12));
  if (pool.length < 3) return { surahId, nextAyah: null, order: [] as typeof pool };
  const i = randomInt(0, pool.length - 1);
  const distractors = pool.filter((_, k) => k !== i + 1 && k !== i).slice(0, 2);
  const options = [pool[i + 1], ...distractors].sort((a, b) => a.id - b.id).map((a) => ({ id: a.id, text: a.text }));
  const startAt = randomInt(0, Math.max(1, pool.length - 3));
  const order = pool.slice(startAt, startAt + 3).map((a) => ({ id: a.id, ayahNumber: a.ayahNumber, text: a.text })).sort((a, b) => (a.text > b.text ? 1 : -1));
  return { surahId, nextAyah: { promptId: pool[i].id, prompt: pool[i].text, options }, order };
}

export const memorizationAnswerSchema = z.object({ surahId: z.coerce.number().int().min(1).max(114), promptId: z.coerce.number().int(), chosenId: z.coerce.number().int(), orderIds: z.array(z.coerce.number().int()).min(2).max(5) });

/** Verifies against stored ayah order. An indicator only: the teacher's rating sets the skill. */
export async function savePlacementMemorization(actor: Actor, a: z.infer<typeof memorizationAnswerSchema>) {
  const p = await getPlacement(actor);
  if (p.status !== "DRAFT") throw conflict("placement_submitted");
  const nextOk = a.chosenId === a.promptId + 1;
  const orderOk = a.orderIds.every((id, i) => i === 0 || id === a.orderIds[i - 1] + 1);
  const pct = ((nextOk ? 1 : 0) + (orderOk ? 1 : 0)) * 50;
  return systemDb().placementAssessment.update({ where: { id: p.id }, data: { memorizationAnswers: a, memorizationPercent: pct, stage: Math.max(p.stage, 4) } });
}

export function recommendTrack(i: { experience?: string; goal?: string; memorizedJuz?: number; tajweedPercent?: number | null; memorizationPercent?: number | null }): (typeof TRACKS)[number] {
  const juz = i.memorizedJuz ?? 0;
  if (i.experience === "none") return "foundation";
  if (i.goal === "read") return "recitation_correction";
  if (i.goal === "tajweed") return "tajweed_mastery";
  if (i.goal === "revise" || (juz >= 3 && (i.memorizationPercent ?? 0) < 50)) return "consolidation";
  if (juz >= 15) return "advanced_exam_prep";
  if (juz >= 5) return "memorization_advanced";
  if (juz >= 1) return "memorization_intermediate";
  return "memorization_beginner";
}

export async function submitPlacement(actor: Actor) {
  const p = await getPlacement(actor);
  if (p.status !== "DRAFT") throw conflict("placement_submitted");
  const intake = intakeSchema.safeParse(p.intake);
  if (!intake.success) throw conflict("intake_incomplete");
  const recommendedTrack = recommendTrack({ ...intake.data, tajweedPercent: p.tajweedPercent, memorizationPercent: p.memorizationPercent });
  const row = await systemDb().placementAssessment.update({ where: { id: p.id }, data: { status: "SUBMITTED", stage: 5, recommendedTrack } });
  await audit(actor.id, "placement.submit", "PlacementAssessment", p.id);
  return row;
}

export const placementReviewSchema = z.object({
  skills: z.object(Object.fromEntries(SKILLS.map((s) => [s, z.coerce.number().int().min(1).max(5)])) as Record<(typeof SKILLS)[number], z.ZodCoercedNumber>),
  track: z.enum(TRACKS),
  note: z.string().trim().max(2000).optional(),
});

/** Teacher decision: writes the skills profile with its source and date, then sets the track. */
export async function reviewPlacement(actor: Actor, id: string, input: z.infer<typeof placementReviewSchema>) {
  const db = systemDb();
  const p = await db.placementAssessment.findUnique({ where: { id } });
  if (!p) throw notFound();
  if (!actor.perms.has("reviews.write")) throw forbidden();
  await assertTeaches(actor, p.studentId);
  if (p.status !== "SUBMITTED") throw conflict("placement_not_submitted");
  await db.$transaction([
    db.studentSkill.createMany({ data: SKILLS.map((skill) => ({ studentId: p.studentId, skill, level: input.skills[skill] as number, source: "teacher_placement", assessedById: actor.id, assessmentId: id })) }),
    db.placementAssessment.update({ where: { id }, data: { status: "APPROVED", approvedTrack: input.track, teacherNote: input.note, reviewedById: actor.id, reviewedAt: new Date() } }),
    db.student.update({ where: { id: p.studentId }, data: { track: input.track } }),
  ]);
  await audit(actor.id, "placement.approve", "PlacementAssessment", id, { track: input.track });
  const aud = await studentAudience(p.studentId);
  await notify([...aud.student, ...aud.guardians], "placement.approved", {}, "/student/placement");
}

export async function placementAudio(actor: Actor, id: string, stage: "reading" | "memorization") {
  const p = await systemDb().placementAssessment.findUnique({ where: { id } });
  if (!p) throw notFound();
  return fileUrl(actor, stage === "reading" ? p.readingFileId : p.memorizationFileId, p.studentId, "placement.listen");
}

export const currentSkills = (actor: Actor, studentId: string) =>
  withActor(actor, async (tx) => {
    const rows = await tx.studentSkill.findMany({ where: { studentId }, orderBy: { createdAt: "desc" } });
    const seen = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!seen.has(r.skill)) seen.set(r.skill, r);
    return [...seen.values()];
  });

// ---------- Competitions ----------

export const competitionSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]+$/).max(60), title: z.string().trim().min(3).max(160), description: z.string().trim().min(3).max(4000),
  kind: z.enum(["quran_memorization", "tajweed", "tafsir", "hadith", "quran_knowledge", "revision", "periodic", "level_completion"]),
  level: z.enum(["beginner", "intermediate", "advanced"]), ageGroup: z.string().trim().max(60).optional(), conditions: z.string().trim().max(2000).optional(),
  criteria: z.string().trim().min(3).max(2000), resultsMethod: z.string().trim().min(3).max(500), prizes: z.string().trim().max(500).optional(),
  registrationOpensAt: z.coerce.date(), registrationClosesAt: z.coerce.date(), examStartsAt: z.coerce.date(), examEndsAt: z.coerce.date(),
  durationMin: z.coerce.number().int().min(1).max(600), maxAttempts: z.coerce.number().int().min(1).max(10).default(1),
  randomize: z.boolean().default(true), leaderboardEnabled: z.boolean().default(false), published: z.boolean().default(false),
  questionIds: z.array(z.string()).min(1).max(200),
}).refine((c) => c.registrationOpensAt < c.registrationClosesAt && c.examStartsAt < c.examEndsAt, "invalid dates");

export async function createCompetition(actor: Actor, input: z.infer<typeof competitionSchema>) {
  if (!actor.perms.has("assessments.manage")) throw forbidden();
  const db = systemDb();
  const { questionIds, ...rest } = input;
  const active = await db.question.count({ where: { id: { in: questionIds }, active: true } });
  if (active !== questionIds.length) throw conflict("question_not_active");
  const kindMap: Record<string, "MEMORIZATION" | "REVISION" | "TAJWEED" | "TAFSIR"> = { tajweed: "TAJWEED", tafsir: "TAFSIR", revision: "REVISION" };
  const assessment = await db.assessment.create({ data: { title: input.title, kind: kindMap[input.kind] ?? "MEMORIZATION", createdById: actor.id, published: false, items: { create: questionIds.map((questionId, sortOrder) => ({ questionId, sortOrder })) } } });
  const c = await db.competition.create({ data: { ...rest, assessmentId: assessment.id, createdById: actor.id } });
  await audit(actor.id, "competition.create", "Competition", c.id);
  return c;
}

export const publicCompetitions = () => systemDb().competition.findMany({ where: { published: true, ...notDemoRow() }, orderBy: { examStartsAt: "desc" } });

export async function registerCompetition(actor: Actor, competitionId: string, showOnLeaderboard: boolean, now = new Date()) {
  const studentId = needStudent(actor);
  const db = systemDb();
  const c = await db.competition.findFirst({ where: { id: competitionId, published: true, ...notDemoRow() } });
  if (!c) throw notFound();
  if (now < c.registrationOpensAt || now > c.registrationClosesAt) throw conflict("registration_closed");
  const st = await db.student.findUniqueOrThrow({ where: { id: studentId } });
  const row = await db.competitionRegistration.upsert({
    where: { competitionId_studentId: { competitionId, studentId } }, update: { showOnLeaderboard: showOnLeaderboard && !st.isMinor },
    create: { competitionId, studentId, showOnLeaderboard: showOnLeaderboard && !st.isMinor },
  });
  await audit(actor.id, "competition.register", "Competition", competitionId);
  return row;
}

const shuffled = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = randomInt(0, i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const event = (attemptId: string, type: string, meta: object = {}) => systemDb().examEvent.create({ data: { attemptId, type, meta } });

/** Resumes an open attempt, or starts one if the window and attempt limit allow. */
export async function startExam(actor: Actor, competitionId: string, now = new Date()) {
  const studentId = needStudent(actor);
  const db = systemDb();
  const c = await db.competition.findFirst({ where: { id: competitionId, published: true, ...notDemoRow() }, include: { assessment: { include: { items: { orderBy: { sortOrder: "asc" } } } } } });
  if (!c) throw notFound();
  if (!(await db.competitionRegistration.count({ where: { competitionId, studentId } }))) throw forbidden();
  if (now < c.examStartsAt || now > c.examEndsAt) throw conflict("exam_not_open");
  const attempts = await db.assessmentAttempt.findMany({ where: { assessmentId: c.assessmentId, studentId }, orderBy: { attemptNo: "desc" } });
  const open = attempts.find((a) => a.status === "IN_PROGRESS");
  if (open) {
    if (!open.expiresAt || open.expiresAt > now) { await event(open.id, "resumed"); return open; }
    await finishExam(actor, open.id, now, true);
  }
  const fresh = await db.assessmentAttempt.count({ where: { assessmentId: c.assessmentId, studentId } });
  if (fresh >= c.maxAttempts) throw conflict("no_attempts_left");
  const ids = c.assessment.items.map((i) => i.questionId);
  const end = Math.min(c.examEndsAt.getTime(), now.getTime() + c.durationMin * 60000);
  const a = await db.assessmentAttempt.create({ data: { assessmentId: c.assessmentId, studentId, attemptNo: fresh + 1, expiresAt: new Date(end), startedAt: now, questionOrder: c.randomize ? shuffled(ids) : ids } });
  await event(a.id, "started");
  return a;
}

/** The student's own view. correctKey is never selected, and option order hides ORDER answers. */
export async function examView(actor: Actor, attemptId: string) {
  const db = systemDb();
  const a = await db.assessmentAttempt.findUnique({ where: { id: attemptId }, include: { answers: { select: { questionId: true, selectedKey: true, textAnswer: true, fileId: true } } } });
  if (!a || a.studentId !== actor.studentId) throw notFound();
  const order = (a.questionOrder as string[] | null) ?? [];
  const qs = await db.question.findMany({ where: { id: { in: order } }, select: { id: true, type: true, promptAr: true, promptEn: true, options: true, points: true } });
  const byId = new Map(qs.map((q) => [q.id, q]));
  return {
    id: a.id, status: a.status, expiresAt: a.expiresAt, scorePercent: a.scorePercent, answers: a.answers,
    questions: order.map((id) => byId.get(id)!).filter(Boolean).map((q) => ({ ...q, options: q.type === "ORDER" && Array.isArray(q.options) ? shuffled(q.options as object[]) : q.options })),
  };
}

export const answerSchema = z.object({ questionId: z.string(), selectedKey: z.string().max(10).optional(), textAnswer: z.string().max(4000).optional() });

async function openAttempt(actor: Actor, attemptId: string, now: Date) {
  const a = await systemDb().assessmentAttempt.findUnique({ where: { id: attemptId } });
  if (!a || a.studentId !== actor.studentId) throw notFound();
  if (a.status !== "IN_PROGRESS") throw conflict("already_submitted");
  if (a.expiresAt && a.expiresAt < now) throw conflict("time_expired");
  return a;
}

/** Autosave. A late save is refused by the server's clock. */
export async function saveAnswer(actor: Actor, attemptId: string, input: z.infer<typeof answerSchema>, now = new Date(), fileId?: string) {
  const a = await openAttempt(actor, attemptId, now);
  if (!((a.questionOrder as string[] | null) ?? []).includes(input.questionId)) throw conflict("unknown_question");
  const data = { selectedKey: input.selectedKey, textAnswer: input.textAnswer, ...(fileId ? { fileId } : {}) };
  await systemDb().assessmentAnswer.upsert({ where: { attemptId_questionId: { attemptId, questionId: input.questionId } }, update: data, create: { attemptId, questionId: input.questionId, ...data } });
}

export async function saveAudioAnswer(actor: Actor, attemptId: string, questionId: string, consent: boolean, file: File) {
  if (!consent) throw badRequest("consent_required");
  await openAttempt(actor, attemptId, new Date());
  const { fileId } = await storeAudio(actor, file, "exam");
  await saveAnswer(actor, attemptId, { questionId }, new Date(), fileId);
}

/** Grades objective answers. Anything needing a person leaves the attempt awaiting review. */
export async function finishExam(actor: Actor, attemptId: string, now = new Date(), expired = false) {
  const db = systemDb();
  const a = await db.assessmentAttempt.findUnique({ where: { id: attemptId }, include: { answers: true } });
  if (!a || a.studentId !== actor.studentId) throw notFound();
  if (a.status !== "IN_PROGRESS") throw conflict("already_submitted");
  const order = (a.questionOrder as string[] | null) ?? [];
  const qs = await db.question.findMany({ where: { id: { in: order } } });
  const graded = [];
  for (const q of qs) {
    const ans = a.answers.find((x) => x.questionId === q.id);
    const ratio = gradeObjective(q, { selectedKey: ans?.selectedKey, textAnswer: ans?.textAnswer });
    graded.push({ points: q.points, ratio });
    await db.assessmentAnswer.upsert({ where: { attemptId_questionId: { attemptId, questionId: q.id } }, update: { awardedRatio: ratio }, create: { attemptId, questionId: q.id, awardedRatio: ratio } });
  }
  const r = scoreAttempt(graded);
  const done = await db.assessmentAttempt.update({ where: { id: attemptId }, data: { status: r.pending ? "SUBMITTED" : "GRADED", scorePercent: r.pending ? null : r.percent, submittedAt: now } });
  await event(attemptId, expired ? "expired" : "submitted");
  return done;
}

export async function examAnswerAudio(actor: Actor, attemptId: string, questionId: string) {
  const db = systemDb();
  const ans = await db.assessmentAnswer.findUnique({ where: { attemptId_questionId: { attemptId, questionId } }, include: { attempt: { select: { studentId: true } } } });
  if (!ans) throw notFound();
  return fileUrl(actor, ans.fileId, ans.attempt.studentId, "exam.listen");
}

/** Skills the student should revisit, by tag, from questions they missed. */
export async function examFeedback(actor: Actor, attemptId: string) {
  const db = systemDb();
  const a = await db.assessmentAttempt.findUnique({ where: { id: attemptId }, include: { answers: { include: { question: { select: { tag: true, kind: true } } } } } });
  if (!a) throw notFound();
  if (a.studentId !== actor.studentId && !(await canTeach(actor, a.studentId))) throw notFound();
  const missed: Record<string, number> = {};
  for (const x of a.answers) if (x.awardedRatio !== null && x.awardedRatio < 1) { const k = x.question.tag ?? x.question.kind; missed[k] = (missed[k] ?? 0) + 1; }
  return { status: a.status, scorePercent: a.scorePercent, missed };
}

export const publishResults = async (actor: Actor, id: string) => {
  if (!actor.perms.has("assessments.manage")) throw forbidden();
  await systemDb().competition.update({ where: { id }, data: { resultsPublished: true } });
  await audit(actor.id, "competition.publish_results", "Competition", id);
};

/** Opt-in only, adults only, first name only, and only after results are published. */
export async function leaderboard(competitionId: string) {
  const db = systemDb();
  const c = await db.competition.findFirst({ where: { id: competitionId, published: true, resultsPublished: true, leaderboardEnabled: true } });
  if (!c) return [];
  const regs = await db.competitionRegistration.findMany({ where: { competitionId, showOnLeaderboard: true, student: { isMinor: false } }, select: { studentId: true, student: { select: { user: { select: { name: true } } } } } });
  const rows = [];
  for (const r of regs) {
    const best = await db.assessmentAttempt.findFirst({ where: { assessmentId: c.assessmentId, studentId: r.studentId, status: "GRADED" }, orderBy: { scorePercent: "desc" } });
    if (best?.scorePercent != null) rows.push({ name: r.student.user.name.split(" ")[0], score: best.scorePercent });
  }
  return rows.sort((a, b) => b.score - a.score);
}

export async function fileAppeal(actor: Actor, attemptId: string, reason: string) {
  const a = await systemDb().assessmentAttempt.findUnique({ where: { id: attemptId } });
  if (!a || a.studentId !== actor.studentId) throw notFound();
  if (a.status === "IN_PROGRESS") throw conflict("attempt_open");
  if (await systemDb().examAppeal.count({ where: { attemptId, status: "PENDING" } })) throw conflict("appeal_pending");
  const row = await systemDb().examAppeal.create({ data: { attemptId, studentId: a.studentId, reason } });
  await audit(actor.id, "appeal.file", "ExamAppeal", row.id);
  return row;
}

// ---------- Tajweed and tafsir study ----------

const lessonIsApproved = async (slug: string) => (await systemDb().tajweedRule.count({ where: { slug, ...approved() } })) > 0;

export const lessonQuestions = async (slug: string) => {
  if (!(await lessonIsApproved(slug))) return [];
  return systemDb().question.findMany({ where: { active: true, ...notDemoRow(), tag: `rule:${slug}`, type: { in: ["MULTIPLE_CHOICE", "TRUE_FALSE"] } }, select: { id: true, type: true, promptAr: true, promptEn: true, options: true } });
};

export async function submitLessonQuiz(actor: Actor, slug: string, answers: Record<string, string>) {
  const studentId = needStudent(actor);
  const db = systemDb();
  if (!(await lessonIsApproved(slug))) throw notFound();
  const qs = await db.question.findMany({ where: { active: true, ...notDemoRow(), tag: `rule:${slug}`, type: { in: ["MULTIPLE_CHOICE", "TRUE_FALSE"] } } });
  if (!qs.length) throw notFound();
  const right = qs.filter((q) => answers[q.id] === q.correctKey).length;
  const scorePercent = Math.round((right / qs.length) * 100);
  await db.lessonProgress.upsert({ where: { studentId_ruleSlug: { studentId, ruleSlug: slug } }, update: { scorePercent, completedAt: new Date() }, create: { studentId, ruleSlug: slug, scorePercent, completedAt: new Date() } });
  return { scorePercent, right, total: qs.length };
}

export const completeLesson = async (actor: Actor, slug: string) => {
  const studentId = needStudent(actor);
  if (!(await lessonIsApproved(slug))) throw notFound();
  return systemDb().lessonProgress.upsert({ where: { studentId_ruleSlug: { studentId, ruleSlug: slug } }, update: { completedAt: new Date() }, create: { studentId, ruleSlug: slug, completedAt: new Date() } });
};

export async function lessonNote(actor: Actor, studentId: string, slug: string, note: string) {
  await assertTeaches(actor, studentId);
  return systemDb().lessonProgress.upsert({ where: { studentId_ruleSlug: { studentId, ruleSlug: slug } }, update: { teacherNote: note }, create: { studentId, ruleSlug: slug, teacherNote: note } });
}

export const saveTafsirProgress = (actor: Actor, surahId: number, ayahUpTo: number) => {
  const studentId = needStudent(actor);
  return systemDb().tafsirProgress.upsert({ where: { studentId_surahId: { studentId, surahId } }, update: { ayahUpTo }, create: { studentId, surahId, ayahUpTo } });
};

export const saveAyahNote = (actor: Actor, ayahId: number, body: string) =>
  withActor(actor, async (tx) => {
    if (!body) { await tx.ayahNote.deleteMany({ where: { userId: actor.id, ayahId } }); return null; }
    return tx.ayahNote.upsert({ where: { userId_ayahId: { userId: actor.id, ayahId } }, update: { body }, create: { userId: actor.id, ayahId, body } });
  });

export const getAyahNote = (actor: Actor, ayahId: number) => withActor(actor, (tx) => tx.ayahNote.findUnique({ where: { userId_ayahId: { userId: actor.id, ayahId } } }));

/** Tajweed rule explanations for one word, from the same reviewed annotations as the colours. */
export async function wordRules(ayahId: number, start: number, end: number) {
  const db = systemDb();
  const a = await db.tajweedAnnotation.findUnique({ where: { ayahId } });
  if (!a) return [];
  const codes = [...new Set((JSON.parse(a.markup) as [number, number, string][]).filter(([s, e]) => s < end && e > start).map((x) => x[2]))];
  return db.tajweedRule.findMany({ where: { markupCode: { in: codes }, ...approved() }, select: { slug: true, titleAr: true, titleEn: true, bodyAr: true, bodyEn: true } });
}
