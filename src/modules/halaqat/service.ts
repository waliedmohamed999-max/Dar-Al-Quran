import { z } from "zod";
import { audit } from "@/lib/audit";
import { decryptField, encryptField } from "@/lib/crypto";
import { systemDb, withActor, type Tx } from "@/lib/db";
import { conflict, forbidden, notFound } from "@/lib/errors";
import type { Actor } from "@/lib/session";
import { notify, studentAudience } from "../notifications/service";

export const halaqaSchema = z.object({
  name: z.string().trim().min(2).max(120),
  teacherId: z.string().min(1).nullable().optional(),
  ageGroup: z.string().trim().max(40).nullable().optional(),
  level: z.coerce.number().int().min(1).max(10),
  gender: z.enum(["ANY", "MALE", "FEMALE"]),
  capacity: z.coerce.number().int().min(1).max(200),
  mode: z.enum(["IN_PERSON", "REMOTE", "HYBRID"]),
  meetingUrl: z.url({ protocol: /^https$/ }).nullable().optional().or(z.literal("").transform(() => null)),
  location: z.string().trim().max(200).nullable().optional(),
  schedule: z.array(z.object({
    weekday: z.coerce.number().int().min(0).max(6),
    startMin: z.coerce.number().int().min(0).max(1439),
    endMin: z.coerce.number().int().min(1).max(1440),
  }).refine((s) => s.endMin > s.startMin, "end must be after start")).default([]),
});

export async function createHalaqa(actor: Actor, input: z.infer<typeof halaqaSchema>) {
  const { schedule, meetingUrl, ...rest } = input;
  const h = await withActor(actor, (tx) =>
    tx.halaqa.create({
      data: { ...rest, meetingUrlEnc: meetingUrl ? encryptField(meetingUrl) : null, schedule: { create: schedule } },
    }),
  );
  await audit(actor.id, "halaqa.create", "Halaqa", h.id);
  return h;
}

export async function updateHalaqa(actor: Actor, id: string, input: Partial<z.infer<typeof halaqaSchema>> & { active?: boolean }) {
  const { schedule, meetingUrl, ...rest } = input;
  const h = await withActor(actor, async (tx) => {
    if (schedule) {
      await tx.halaqaSchedule.deleteMany({ where: { halaqaId: id } });
      await tx.halaqaSchedule.createMany({ data: schedule.map((s) => ({ ...s, halaqaId: id })) });
    }
    return tx.halaqa.update({
      where: { id },
      data: { ...rest, ...(meetingUrl !== undefined ? { meetingUrlEnc: meetingUrl ? encryptField(meetingUrl) : null } : {}) },
    });
  });
  await audit(actor.id, "halaqa.update", "Halaqa", id, { fields: Object.keys(input) });
  return h;
}

/** Link shown only to the teacher, staff and active members; the database stores ciphertext. */
export const meetingLinkFor = (actor: Actor, halaqaId: string) =>
  withActor(actor, async (tx) => {
    const h = await tx.halaqa.findUnique({ where: { id: halaqaId } });
    if (!h?.meetingUrlEnc) return null;
    const teacher = actor.teacherId && h.teacherId === actor.teacherId;
    const staff = actor.perms.has("halaqas.manage");
    const member = actor.studentId && (await tx.enrollment.count({ where: { halaqaId, studentId: actor.studentId, status: "ACTIVE" } })) > 0;
    if (!teacher && !staff && !member) throw forbidden();
    return decryptField(h.meetingUrlEnc);
  });

export async function requestEnrollment(actor: Actor, halaqaId: string, studentId: string) {
  const e = await withActor(actor, async (tx) => {
    const h = await tx.halaqa.findUnique({ where: { id: halaqaId } });
    if (!h?.active) throw notFound();
    // RLS rejects the insert unless the actor is this student or their approved guardian.
    return tx.enrollment.create({ data: { halaqaId, studentId, status: "PENDING" } });
  });
  await audit(actor.id, "enrollment.request", "Enrollment", e.id);
  return e;
}

/** Row lock on the halaqa serializes approvals so capacity cannot be exceeded. */
async function lockHalaqa(tx: Tx, halaqaId: string) {
  const rows = await tx.$queryRaw<{ capacity: number }[]>`SELECT capacity FROM halaqas WHERE id = ${halaqaId} FOR UPDATE`;
  if (!rows[0]) throw notFound();
  const active = await tx.enrollment.count({ where: { halaqaId, status: "ACTIVE" } });
  return { capacity: rows[0].capacity, active };
}

export async function decideEnrollment(actor: Actor, id: string, approve: boolean) {
  const e = await withActor(actor, async (tx) => {
    const current = await tx.enrollment.findUnique({ where: { id } });
    if (!current) throw notFound();
    if (!["PENDING", "WAITLISTED"].includes(current.status)) throw conflict("already_decided");
    const { capacity, active } = await lockHalaqa(tx, current.halaqaId);
    const status = !approve ? "REJECTED" : active < capacity ? "ACTIVE" : "WAITLISTED";
    return tx.enrollment.update({ where: { id }, data: { status, decidedById: actor.id, decidedAt: new Date() } });
  });
  await audit(actor.id, "enrollment.decide", "Enrollment", id, { status: e.status });
  const aud = await studentAudience(e.studentId);
  await notify([...aud.student, ...aud.guardians], e.status === "ACTIVE" ? "enrollment.active" : e.status === "WAITLISTED" ? "enrollment.waitlisted" : "enrollment.rejected", {});
  return e;
}

/** Withdrawing frees a seat for the oldest waitlisted student, in the same transaction. */
export async function withdrawEnrollment(actor: Actor, id: string) {
  const { promoted, e } = await withActor(actor, async (tx) => {
    const current = await tx.enrollment.findUnique({ where: { id } });
    if (!current) throw notFound();
    if (current.status === "WITHDRAWN") throw conflict("already_withdrawn");
    const e = await tx.enrollment.update({ where: { id }, data: { status: "WITHDRAWN", decidedById: actor.id, decidedAt: new Date() } });
    return { e, promoted: current.status === "ACTIVE" };
  });
  await audit(actor.id, "enrollment.withdraw", "Enrollment", id);
  if (promoted) {
    // Promotion crosses other students' rows, which a self-withdrawing student cannot touch.
    const next = await systemDb().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM halaqas WHERE id = ${e.halaqaId} FOR UPDATE`;
      const h = await tx.halaqa.findUniqueOrThrow({ where: { id: e.halaqaId } });
      const active = await tx.enrollment.count({ where: { halaqaId: e.halaqaId, status: "ACTIVE" } });
      if (active >= h.capacity) return null;
      const w = await tx.enrollment.findFirst({ where: { halaqaId: e.halaqaId, status: "WAITLISTED" }, orderBy: { createdAt: "asc" } });
      if (!w) return null;
      return tx.enrollment.update({ where: { id: w.id }, data: { status: "ACTIVE", decidedAt: new Date() } });
    });
    if (next) {
      await audit(null, "enrollment.promote_waitlist", "Enrollment", next.id);
      const aud = await studentAudience(next.studentId);
      await notify([...aud.student, ...aud.guardians], "enrollment.active", {});
    }
  }
  return e;
}

const TZ_OFFSET_MIN = () => Number(process.env.APP_TZ_OFFSET_MIN ?? 180);

/** Creates session rows from the weekly schedule. Existing sessions are left unchanged. */
export async function generateSessions(actor: Actor, halaqaId: string, weeks: number, from = new Date()) {
  const created = await withActor(actor, async (tx) => {
    const schedule = await tx.halaqaSchedule.findMany({ where: { halaqaId } });
    const rows: { halaqaId: string; startsAt: Date; endsAt: Date }[] = [];
    const startDay = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
    for (let d = 0; d < weeks * 7; d++) {
      const day = new Date(startDay + d * 86400000);
      for (const s of schedule.filter((x) => x.weekday === day.getUTCDay())) {
        rows.push({
          halaqaId,
          startsAt: new Date(day.getTime() + (s.startMin - TZ_OFFSET_MIN()) * 60000),
          endsAt: new Date(day.getTime() + (s.endMin - TZ_OFFSET_MIN()) * 60000),
        });
      }
    }
    return (await tx.halaqaSession.createMany({ data: rows, skipDuplicates: true })).count;
  });
  await audit(actor.id, "session.generate", "Halaqa", halaqaId, { created });
  return { created };
}

export const attendanceSchema = z.object({
  records: z.array(z.object({
    studentId: z.string().min(1),
    status: z.enum(["PRESENT", "LATE", "ABSENT", "EXCUSED"]),
    note: z.string().trim().max(300).optional(),
  })).min(1),
});

export async function recordAttendance(actor: Actor, sessionId: string, input: z.infer<typeof attendanceSchema>) {
  const session = await withActor(actor, async (tx) => {
    const s = await tx.halaqaSession.findUnique({ where: { id: sessionId } });
    if (!s) throw notFound();
    const members = await tx.enrollment.findMany({ where: { halaqaId: s.halaqaId, status: "ACTIVE" }, select: { studentId: true } });
    const ids = new Set(members.map((m) => m.studentId));
    if (input.records.some((r) => !ids.has(r.studentId))) throw conflict("student_not_in_halaqa");
    for (const r of input.records) {
      await tx.attendance.upsert({
        where: { sessionId_studentId: { sessionId, studentId: r.studentId } },
        update: { status: r.status, note: r.note, recordedById: actor.id },
        create: { sessionId, studentId: r.studentId, status: r.status, note: r.note, recordedById: actor.id },
      });
    }
    await tx.halaqaSession.update({ where: { id: sessionId }, data: { status: "HELD" } });
    return s;
  });
  await audit(actor.id, "attendance.record", "HalaqaSession", sessionId, { count: input.records.length });
  for (const r of input.records.filter((x) => x.status === "ABSENT")) {
    const aud = await studentAudience(r.studentId);
    await notify(aud.guardians, "attendance.absent", { date: session.startsAt.toISOString().slice(0, 10) });
  }
}

export async function setSubstitute(actor: Actor, sessionId: string, teacherId: string | null) {
  const s = await withActor(actor, (tx) => tx.halaqaSession.update({ where: { id: sessionId }, data: { substituteTeacherId: teacherId } }));
  await audit(actor.id, "session.substitute", "HalaqaSession", sessionId);
  return s;
}
