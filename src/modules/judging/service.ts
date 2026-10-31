// Live oral judging: rubrics, panels, scores, human approval, results and certificates that rest on them.
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { systemDb, withActor } from "@/lib/db";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import type { Actor } from "@/lib/session";
import { notify, studentAudience } from "../notifications/service";

// ---------- Pure scoring, tested directly ----------

type Crit = { id: string; maxScore: number; weight: number };

/** One judge's weighted percentage, or null until they have scored every criterion. */
export function judgePercent(criteria: Crit[], scores: Map<string, number>): number | null {
  if (!criteria.length || criteria.some((c) => !scores.has(c.id))) return null;
  const weights = criteria.reduce((n, c) => n + c.weight, 0);
  return criteria.reduce((n, c) => n + (scores.get(c.id)! / c.maxScore) * c.weight, 0) / weights * 100;
}

/** The panel's mean, pending until every judge finishes. A wide spread is shown so a person can look again. */
export function aggregate(criteria: Crit[], perJudge: Map<string, number>[]) {
  const pcts = perJudge.map((s) => judgePercent(criteria, s));
  if (!pcts.length || pcts.some((p) => p === null)) return { percent: null, spread: null };
  const v = pcts as number[];
  return { percent: Math.round(v.reduce((a, b) => a + b, 0) / v.length), spread: Math.round(Math.max(...v) - Math.min(...v)) };
}

/** Standard ranking: equal scores share a rank, and the next rank skips. */
export function rank<T extends { percent: number }>(rows: T[]) {
  const sorted = [...rows].sort((a, b) => b.percent - a.percent);
  return sorted.map((r) => ({ ...r, rank: sorted.findIndex((x) => x.percent === r.percent) + 1 }));
}

// ---------- Rubrics and sessions ----------

export const rubricSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(1000).optional(),
  criteria: z.array(z.object({
    labelAr: z.string().trim().min(2).max(120), labelEn: z.string().trim().max(120).optional(),
    guidanceAr: z.string().trim().min(5).max(600), maxScore: z.coerce.number().int().min(1).max(100), weight: z.coerce.number().int().min(1).max(10).default(1),
  })).min(1).max(15),
});

export async function createRubric(actor: Actor, input: z.infer<typeof rubricSchema>) {
  if (!actor.perms.has("assessments.manage")) throw forbidden();
  const { criteria, ...rest } = input;
  const r = await systemDb().rubric.create({ data: { ...rest, createdById: actor.id, criteria: { create: criteria.map((c, sortOrder) => ({ ...c, sortOrder })) } } });
  await audit(actor.id, "rubric.create", "Rubric", r.id);
  return r;
}

export const sessionSchema = z.object({
  competitionId: z.string().min(1), rubricId: z.string().min(1), title: z.string().trim().min(3).max(160), scheduledAt: z.coerce.date(),
  passPercent: z.coerce.number().int().min(1).max(100).default(60), judgeIds: z.array(z.string().min(1)).min(1).max(15),
});

/** Registered students become entries, each with a random public code. */
export async function createSession(actor: Actor, input: z.infer<typeof sessionSchema>) {
  if (!actor.perms.has("assessments.manage")) throw forbidden();
  const db = systemDb();
  const judges = await db.user.findMany({ where: { id: { in: input.judgeIds }, status: "ACTIVE", roles: { some: { role: { permissions: { some: { permission: { key: "reviews.write" } } } } } } }, select: { id: true } });
  if (judges.length !== new Set(input.judgeIds).size) throw conflict("judge_not_eligible");
  const regs = await db.competitionRegistration.findMany({ where: { competitionId: input.competitionId }, select: { studentId: true } });
  if (!regs.length) throw conflict("no_registrations");
  const { judgeIds, ...rest } = input;
  const s = await db.judgingSession.create({
    data: {
      ...rest, createdById: actor.id,
      judges: { create: [...new Set(judgeIds)].map((userId) => ({ userId })) },
      entries: { create: regs.map((r, i) => ({ studentId: r.studentId, sortOrder: i + 1, code: `P-${randomBytes(3).toString("hex").toUpperCase()}` })) },
    },
  });
  await audit(actor.id, "judging.create", "JudgingSession", s.id);
  return s;
}

async function assertJudge(actor: Actor, sessionId: string) {
  const row = await systemDb().judgingJudge.findUnique({ where: { sessionId_userId: { sessionId, userId: actor.id } } });
  if (!row) throw forbidden();
}
const canManage = (actor: Actor) => actor.perms.has("assessments.manage");

export async function openSession(actor: Actor, id: string) {
  if (!canManage(actor)) await assertJudge(actor, id);
  const r = await systemDb().judgingSession.updateMany({ where: { id, status: "SCHEDULED" }, data: { status: "OPEN" } });
  if (!r.count) throw conflict("session_not_scheduled");
  await audit(actor.id, "judging.open", "JudgingSession", id);
}

/** Calls one participant to recite. The previous participant returns to done or waiting. */
export async function callEntry(actor: Actor, entryId: string, status: "ON_STAGE" | "DONE" | "ABSENT" | "WAITING") {
  const db = systemDb();
  const e = await db.judgingEntry.findUnique({ where: { id: entryId }, include: { session: { select: { id: true, status: true } } } });
  if (!e) throw notFound();
  if (!canManage(actor)) await assertJudge(actor, e.sessionId);
  if (e.session.status !== "OPEN") throw conflict("session_not_open");
  await db.$transaction([
    ...(status === "ON_STAGE" ? [db.judgingEntry.updateMany({ where: { sessionId: e.sessionId, status: "ON_STAGE" }, data: { status: "WAITING" } })] : []),
    db.judgingEntry.update({ where: { id: entryId }, data: { status } }),
  ]);
}

export const scoreSchema = z.object({ scores: z.array(z.object({ criterionId: z.string().min(1), score: z.coerce.number().int().min(0).max(100), note: z.string().trim().max(500).optional() })).min(1).max(15) });

/** A judge writes only their own scores, only while the session is open, and within each criterion's maximum. */
export async function submitScores(actor: Actor, entryId: string, input: z.infer<typeof scoreSchema>) {
  const db = systemDb();
  const e = await db.judgingEntry.findUnique({ where: { id: entryId }, include: { session: { select: { id: true, status: true, rubric: { select: { criteria: true } } } } } });
  if (!e) throw notFound();
  await assertJudge(actor, e.sessionId);
  if (e.session.status !== "OPEN") throw conflict("session_not_open");
  if (e.status === "ABSENT") throw conflict("entry_absent");
  const crit = new Map(e.session.rubric.criteria.map((c) => [c.id, c]));
  for (const s of input.scores) {
    const c = crit.get(s.criterionId);
    if (!c) throw badRequest("unknown_criterion");
    if (s.score > c.maxScore) throw badRequest("score_above_maximum");
  }
  await db.$transaction(input.scores.map((s) => db.judgingScore.upsert({
    where: { entryId_judgeId_criterionId: { entryId, judgeId: actor.id, criterionId: s.criterionId } },
    update: { score: s.score, note: s.note }, create: { entryId, judgeId: actor.id, criterionId: s.criterionId, score: s.score, note: s.note },
  })));
  await audit(actor.id, "judging.score", "JudgingEntry", entryId);
}

const loadForResults = (id: string) =>
  systemDb().judgingSession.findUnique({ where: { id }, include: { judges: true, rubric: { include: { criteria: { orderBy: { sortOrder: "asc" } } } }, entries: { orderBy: { sortOrder: "asc" }, include: { scores: true } } } });

function computeEntry(s: NonNullable<Awaited<ReturnType<typeof loadForResults>>>, e: (typeof s.entries)[number]) {
  const perJudge = s.judges.map((j) => new Map(e.scores.filter((x) => x.judgeId === j.userId).map((x) => [x.criterionId, x.score])));
  return aggregate(s.rubric.criteria, perJudge);
}

/** Closes scoring. Every present participant must be fully scored by every judge. */
export async function closeSession(actor: Actor, id: string) {
  if (!canManage(actor)) await assertJudge(actor, id);
  const s = await loadForResults(id);
  if (!s) throw notFound();
  if (s.status !== "OPEN") throw conflict("session_not_open");
  const present = s.entries.filter((e) => e.status !== "ABSENT");
  const results = present.map((e) => ({ id: e.id, ...computeEntry(s, e) }));
  if (results.some((r) => r.percent === null)) throw conflict("scores_incomplete");
  const db = systemDb();
  await db.$transaction([
    ...results.map((r) => db.judgingEntry.update({ where: { id: r.id }, data: { finalPercent: r.percent, status: "DONE" } })),
    db.judgingSession.update({ where: { id }, data: { status: "CLOSED" } }),
  ]);
  await audit(actor.id, "judging.close", "JudgingSession", id);
}

/** Only approved sessions count, and approval comes from outside the panel. */
export async function approveSession(actor: Actor, id: string) {
  if (!canManage(actor)) throw forbidden();
  const db = systemDb();
  const s = await db.judgingSession.findUnique({ where: { id }, include: { judges: true, entries: { select: { studentId: true } } } });
  if (!s) throw notFound();
  if (s.status !== "CLOSED") throw conflict("session_not_closed");
  if (s.judges.some((j) => j.userId === actor.id)) throw conflict("judge_cannot_approve");
  await db.judgingSession.update({ where: { id }, data: { status: "APPROVED", approvedById: actor.id, approvedAt: new Date() } });
  await audit(actor.id, "judging.approve", "JudgingSession", id);
  const people = await db.student.findMany({ where: { id: { in: s.entries.map((e) => e.studentId) } }, select: { userId: true, guardians: { where: { status: "APPROVED" }, select: { guardian: { select: { userId: true } } } } } });
  await notify(people.flatMap((p) => [p.userId, ...p.guardians.map((g) => g.guardian.userId)]), "assessment.graded", { score: "—" }, "/competitions");
}

// ---------- Views ----------

/** Judges see the participant's name in the room. Managers see the same; nobody else may load this. */
export async function sessionConsole(actor: Actor, id: string) {
  const db = systemDb();
  const s = await db.judgingSession.findUnique({
    where: { id },
    include: {
      competition: { select: { title: true, slug: true } }, judges: true, rubric: { include: { criteria: { orderBy: { sortOrder: "asc" } } } },
      entries: { orderBy: { sortOrder: "asc" }, include: { scores: true, student: { select: { user: { select: { name: true } } } } } },
    },
  });
  if (!s) throw notFound();
  const isJudge = s.judges.some((j) => j.userId === actor.id);
  if (!isJudge && !canManage(actor)) throw notFound();
  const all = s as unknown as NonNullable<Awaited<ReturnType<typeof loadForResults>>>;
  return {
    id: s.id, title: s.title, status: s.status, passPercent: s.passPercent, scheduledAt: s.scheduledAt, competition: s.competition, isJudge, judgeCount: s.judges.length, criteria: s.rubric.criteria,
    entries: s.entries.map((e) => {
      const c = computeEntry(all, e as never);
      return {
        id: e.id, code: e.code, name: e.student.user.name, status: e.status, finalPercent: e.finalPercent, computed: c.percent, spread: c.spread,
        // Before closing, a judge sees only their own marks, so judges do not influence each other.
        mine: e.scores.filter((x) => x.judgeId === actor.id).map((x) => ({ criterionId: x.criterionId, score: x.score, note: x.note })),
        scoredBy: new Set(e.scores.map((x) => x.judgeId)).size,
      };
    }),
  };
}

/** Public results: codes and ranks. A first name appears only for an adult who opted in. */
export async function publicResults(competitionId: string) {
  const db = systemDb();
  const c = await db.competition.findFirst({ where: { id: competitionId, published: true, resultsPublished: true } });
  if (!c) return [];
  const entries = await db.judgingEntry.findMany({
    where: { session: { competitionId, status: "APPROVED" }, finalPercent: { not: null } },
    select: { code: true, finalPercent: true, studentId: true, student: { select: { isMinor: true, user: { select: { name: true } } } } },
  });
  const consent = new Set((await db.competitionRegistration.findMany({ where: { competitionId, showOnLeaderboard: true }, select: { studentId: true } })).map((r) => r.studentId));
  return rank(entries.map((e) => ({
    code: e.code, percent: e.finalPercent!,
    name: consent.has(e.studentId) && !e.student.isMinor ? e.student.user.name.split(" ")[0] : null,
  })));
}

/** A participant's own marks after approval, by criterion, as the panel average. */
export async function myJudging(actor: Actor, competitionId: string) {
  if (!actor.studentId) return [];
  const rows = await systemDb().judgingEntry.findMany({
    where: { studentId: actor.studentId, session: { competitionId, status: "APPROVED" } },
    include: { scores: true, session: { select: { title: true, passPercent: true, rubric: { select: { criteria: { orderBy: { sortOrder: "asc" } } } } } } },
  });
  return rows.map((e) => ({
    id: e.id, code: e.code, title: e.session.title, percent: e.finalPercent, passPercent: e.session.passPercent,
    criteria: e.session.rubric.criteria.map((c) => {
      const v = e.scores.filter((s) => s.criterionId === c.id);
      return { label: c.labelAr, labelEn: c.labelEn, max: c.maxScore, average: v.length ? Math.round((v.reduce((n, s) => n + s.score, 0) / v.length) * 10) / 10 : null };
    }),
  }));
}

export async function fileJudgingAppeal(actor: Actor, entryId: string, reason: string) {
  const db = systemDb();
  const e = await db.judgingEntry.findUnique({ where: { id: entryId }, include: { session: { select: { status: true } } } });
  if (!e || e.studentId !== actor.studentId) throw notFound();
  if (e.session.status !== "APPROVED") throw conflict("results_not_final");
  if (await db.examAppeal.count({ where: { judgingEntryId: entryId, status: "PENDING" } })) throw conflict("appeal_pending");
  const row = await db.examAppeal.create({ data: { judgingEntryId: entryId, studentId: e.studentId, reason } });
  await audit(actor.id, "appeal.file", "ExamAppeal", row.id);
  return row;
}

export const appealDecisionSchema = z.object({ approve: z.boolean(), decision: z.string().trim().min(2).max(2000), newScore: z.coerce.number().int().min(0).max(100).optional() });

/** Decides an appeal once. An accepted appeal may correct the score, keeping the old value on record. */
export async function decideAppeal(actor: Actor, id: string, input: z.infer<typeof appealDecisionSchema>) {
  if (!actor.perms.has("assessments.manage")) throw forbidden();
  const db = systemDb();
  const a = await db.examAppeal.findUnique({ where: { id } });
  if (!a) throw notFound();
  if (a.status !== "PENDING") throw conflict("already_decided");
  if (input.newScore !== undefined && !input.approve) throw badRequest("score_needs_acceptance");
  let previousScore: number | null = null;
  if (input.approve && input.newScore !== undefined) {
    if (a.judgingEntryId) {
      previousScore = (await db.judgingEntry.findUniqueOrThrow({ where: { id: a.judgingEntryId } })).finalPercent;
      await db.judgingEntry.update({ where: { id: a.judgingEntryId }, data: { finalPercent: input.newScore } });
    } else if (a.attemptId) {
      previousScore = (await db.assessmentAttempt.findUniqueOrThrow({ where: { id: a.attemptId } })).scorePercent;
      await db.assessmentAttempt.update({ where: { id: a.attemptId }, data: { scorePercent: input.newScore } });
    }
  }
  const row = await db.examAppeal.update({ where: { id }, data: { status: input.approve ? "APPROVED" : "REJECTED", decision: input.decision, decidedById: actor.id, previousScore, newScore: input.newScore } });
  await audit(actor.id, "appeal.decide", "ExamAppeal", id, { approve: input.approve, previousScore, newScore: input.newScore ?? null });
  const aud = await studentAudience(row.studentId);
  await notify(aud.student, "appeal.decided", {}, "/competitions");
  return row;
}

// ---------- Certificates resting on an approved result ----------

export const resultCertificateSchema = z.object({ evidenceType: z.enum(["attempt", "judging"]), evidenceId: z.string().min(1), title: z.string().trim().min(3).max(160), scope: z.string().trim().max(300).optional() });

/**
 * Creates a request only: a different authorized person must still approve it through decideCertificate.
 * Refused until the result is final, passes, and has no open appeal.
 */
export async function requestResultCertificate(actor: Actor, input: z.infer<typeof resultCertificateSchema>) {
  if (!actor.perms.has("certificates.request")) throw forbidden();
  const db = systemDb();
  let studentId: string;
  let percent: number | null;
  let pass: number;
  let open: number;
  if (input.evidenceType === "attempt") {
    const a = await db.assessmentAttempt.findUnique({ where: { id: input.evidenceId }, include: { assessment: { select: { passPercent: true } } } });
    if (!a) throw notFound();
    if (a.status !== "GRADED") throw conflict("result_not_final");
    studentId = a.studentId; percent = a.scorePercent; pass = a.assessment.passPercent;
    open = await db.examAppeal.count({ where: { attemptId: a.id, status: "PENDING" } });
  } else {
    const e = await db.judgingEntry.findUnique({ where: { id: input.evidenceId }, include: { session: { select: { status: true, passPercent: true } } } });
    if (!e) throw notFound();
    if (e.session.status !== "APPROVED") throw conflict("result_not_final");
    studentId = e.studentId; percent = e.finalPercent; pass = e.session.passPercent;
    open = await db.examAppeal.count({ where: { judgingEntryId: e.id, status: "PENDING" } });
  }
  if (open) throw conflict("appeal_pending");
  if (percent === null || percent < pass) throw conflict("result_below_pass");
  if (await db.certificate.count({ where: { studentId, evidenceType: input.evidenceType, evidenceId: input.evidenceId, status: { not: "REJECTED" } } })) throw conflict("certificate_exists");
  // RLS confirms the requester may act on this student.
  const c = await withActor(actor, (tx) => tx.certificate.create({ data: { studentId, title: input.title, scope: input.scope, evidenceType: input.evidenceType, evidenceId: input.evidenceId, code: randomBytes(12).toString("hex").toUpperCase(), requestedById: actor.id } }));
  await audit(actor.id, "certificate.request", "Certificate", c.id, { evidence: input.evidenceType });
  return c;
}
