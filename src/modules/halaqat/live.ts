// Live classes. Video runs on a configured Jitsi server, or an existing encrypted meeting link.
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { decryptField } from "@/lib/crypto";
import { systemDb, withActor } from "@/lib/db";
import { conflict, forbidden, notFound } from "@/lib/errors";
import type { Actor } from "@/lib/session";
import { notify } from "../notifications/service";
import { assignTasks } from "../learning/service";
import { recordAttendance } from "./service";

export const liveDomain = () => process.env.LIVE_JITSI_DOMAIN || null;

export const createLiveSchema = z.object({
  halaqaId: z.string().min(1),
  startsAt: z.coerce.date(),
  minutes: z.coerce.number().int().min(10).max(300),
  topic: z.string().trim().max(160).optional(),
});

async function roleIn(actor: Actor, halaqaId: string) {
  const db = systemDb();
  const staff = actor.perms.has("halaqas.manage");
  const teacher = actor.teacherId ? (await db.halaqa.count({ where: { id: halaqaId, teacherId: actor.teacherId } })) > 0 || (await db.halaqaSession.count({ where: { halaqaId, substituteTeacherId: actor.teacherId } })) > 0 : false;
  const student = actor.studentId ? (await db.enrollment.count({ where: { halaqaId, studentId: actor.studentId, status: "ACTIVE" } })) > 0 : false;
  return { canLead: staff || teacher, isMember: student };
}

export async function createLiveSession(actor: Actor, input: z.infer<typeof createLiveSchema>) {
  const { canLead } = await roleIn(actor, input.halaqaId);
  if (!canLead) throw forbidden();
  const s = await systemDb().halaqaSession.create({
    data: {
      halaqaId: input.halaqaId, startsAt: input.startsAt, endsAt: new Date(input.startsAt.getTime() + input.minutes * 60000), topic: input.topic,
      isOnline: true, liveRoom: `dar-${randomBytes(16).toString("hex")}`,
    },
    include: { halaqa: { select: { name: true, enrollments: { where: { status: "ACTIVE" }, select: { student: { select: { userId: true } } } } } } },
  });
  await audit(actor.id, "live.create", "HalaqaSession", s.id);
  await notify(s.halaqa.enrollments.map((e) => e.student.userId), "session.reminder", { halaqa: s.halaqa.name, time: s.startsAt.toISOString().slice(11, 16) }, `/live/${s.id}`);
  return { id: s.id };
}

/** Authorizes, logs the join, then returns connection details. Rooms are never in listings. */
export async function joinLive(actor: Actor, sessionId: string) {
  const db = systemDb();
  const s = await db.halaqaSession.findUnique({ where: { id: sessionId }, include: { halaqa: { select: { meetingUrlEnc: true } } } });
  if (!s) throw notFound();
  const { canLead, isMember } = await roleIn(actor, s.halaqaId);
  if (!canLead && !isMember) throw forbidden();
  if (s.status === "CANCELLED") throw conflict("session_cancelled");
  await db.liveJoin.upsert({ where: { sessionId_userId: { sessionId, userId: actor.id } }, update: {}, create: { sessionId, userId: actor.id } });
  const domain = liveDomain();
  if (domain && s.liveRoom) return { provider: "jitsi" as const, domain, room: s.liveRoom, displayName: actor.name, canLead };
  if (s.halaqa.meetingUrlEnc) return { provider: "link" as const, url: decryptField(s.halaqa.meetingUrlEnc), canLead };
  return { provider: "none" as const, canLead };
}

/** Teacher sets the shared position; participants poll this and see the same ayahs from stored text. */
export async function shareMushaf(actor: Actor, sessionId: string, surah: number, ayah: number) {
  const s = await systemDb().halaqaSession.findUnique({ where: { id: sessionId } });
  if (!s) throw notFound();
  if (!(await roleIn(actor, s.halaqaId)).canLead) throw forbidden();
  const exists = await systemDb().quranAyah.count({ where: { surahId: surah, ayahNumber: ayah } });
  if (!exists) throw conflict("ayah_out_of_range");
  await systemDb().halaqaSession.update({ where: { id: sessionId }, data: { sharedSurah: surah, sharedAyah: ayah } });
}

export async function liveState(actor: Actor, sessionId: string) {
  const db = systemDb();
  const s = await db.halaqaSession.findUnique({ where: { id: sessionId } });
  if (!s) throw notFound();
  const { canLead, isMember } = await roleIn(actor, s.halaqaId);
  if (!canLead && !isMember) throw forbidden();
  if (!s.sharedSurah || !s.sharedAyah) return { surah: null, ayah: null, ayahs: [] };
  const ayahs = await db.quranAyah.findMany({
    where: { surahId: s.sharedSurah, ayahNumber: { gte: s.sharedAyah, lt: s.sharedAyah + 5 } },
    orderBy: { id: "asc" }, select: { id: true, ayahNumber: true, text: true },
  });
  return { surah: s.sharedSurah, ayah: s.sharedAyah, ayahs };
}

/** Pre-fills attendance from join records; the teacher can still correct it on the attendance page. */
export async function attendanceFromJoins(actor: Actor, sessionId: string) {
  const db = systemDb();
  const s = await db.halaqaSession.findUnique({ where: { id: sessionId }, include: { joins: true, halaqa: { select: { enrollments: { where: { status: "ACTIVE" }, select: { studentId: true, student: { select: { userId: true } } } } } } } });
  if (!s) throw notFound();
  if (!s.halaqa.enrollments.length) return { recorded: 0 };
  const joined = new Set(s.joins.map((j) => j.userId));
  const records = s.halaqa.enrollments.map((e) => ({ studentId: e.studentId, status: joined.has(e.student.userId) ? ("PRESENT" as const) : ("ABSENT" as const) }));
  await recordAttendance(actor, sessionId, { records });
  return { recorded: records.length };
}

export const homeworkSchema = z.object({
  date: z.coerce.date(),
  type: z.enum(["NEW_MEMORIZATION", "NEAR_REVISION", "FAR_REVISION", "LISTENING", "RECITATION", "TAJWEED", "TAFSIR"]),
  surahId: z.coerce.number().int().min(1).max(114).optional(),
  fromAyah: z.coerce.number().int().min(1).optional(),
  toAyah: z.coerce.number().int().min(1).optional(),
  teacherNote: z.string().trim().max(500).optional(),
});

/** Sends the same follow-up task to every active member of the session's halaqa. */
export async function assignHomework(actor: Actor, sessionId: string, input: z.infer<typeof homeworkSchema>) {
  const members = await withActor(actor, async (tx) => {
    const s = await tx.halaqaSession.findUnique({ where: { id: sessionId }, select: { halaqaId: true } });
    if (!s) throw notFound();
    return tx.enrollment.findMany({ where: { halaqaId: s.halaqaId, status: "ACTIVE" }, select: { studentId: true } });
  });
  if (!members.length) return [];
  return assignTasks(actor, { ...input, studentIds: members.map((m) => m.studentId), suggestedMinutes: 10 });
}
