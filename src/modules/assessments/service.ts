import { randomBytes } from "node:crypto";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { systemDb, withActor } from "@/lib/db";
import { conflict, forbidden, notFound } from "@/lib/errors";
import type { Actor } from "@/lib/session";
import { notify, studentAudience } from "../notifications/service";
import { skeleton } from "../quran/text";

const kind = z.enum(["MEMORIZATION", "REVISION", "TAJWEED", "TAFSIR"]);

export const questionSchema = z.object({
  kind,
  type: z.enum(["MULTIPLE_CHOICE", "PRACTICAL", "TRUE_FALSE", "COMPLETE_TEXT", "ORDER", "RECITATION", "ORAL"]),
  level: z.coerce.number().int().min(1).max(10).default(1),
  tag: z.string().trim().max(60).optional(),
  promptAr: z.string().trim().min(3).max(1000),
  promptEn: z.string().trim().max(1000).optional(),
  options: z.array(z.object({ key: z.string().min(1).max(4), textAr: z.string().min(1).max(300), textEn: z.string().max(300).optional() })).min(2).max(6).optional(),
  correctKey: z.string().max(500).optional(),
  points: z.coerce.number().int().min(1).max(100).default(1),
}).refine((q) => {
  if (q.type === "MULTIPLE_CHOICE" || q.type === "TRUE_FALSE") return Boolean(q.options?.some((o) => o.key === q.correctKey));
  if (q.type === "ORDER") return Boolean(q.options && q.correctKey?.split(",").every((k) => q.options!.some((o) => o.key === k)));
  if (q.type === "COMPLETE_TEXT") return Boolean(q.correctKey?.trim());
  return true;
}, "the question needs valid options and a correct answer");

/** The app role cannot read correctKey, so bank writes use the system connection after the permission check. */
export async function createQuestion(actor: Actor, input: z.infer<typeof questionSchema>) {
  if (!actor.perms.has("assessments.manage")) throw forbidden();
  const q = await systemDb().question.create({ data: input, select: { id: true } });
  await audit(actor.id, "question.create", "Question", q.id);
  return q;
}

export const assessmentSchema = z.object({
  title: z.string().trim().min(3).max(160),
  kind,
  halaqaId: z.string().nullable().optional(),
  passPercent: z.coerce.number().int().min(1).max(100).default(60),
  published: z.boolean().default(false),
  questionIds: z.array(z.string()).min(1).max(100),
});

export async function createAssessment(actor: Actor, input: z.infer<typeof assessmentSchema>) {
  const { questionIds, ...rest } = input;
  const a = await withActor(actor, (tx) =>
    tx.assessment.create({
      data: { ...rest, createdById: actor.id, items: { create: questionIds.map((questionId, sortOrder) => ({ questionId, sortOrder })) } },
    }),
  );
  await audit(actor.id, "assessment.create", "Assessment", a.id);
  return a;
}

/** Student view: columns limited at the database level, correct answers are never included. */
export const assessmentForStudent = (actor: Actor, id: string) =>
  withActor(actor, async (tx) => {
    const a = await tx.assessment.findFirst({
      where: { id, published: true },
      select: {
        id: true, title: true, kind: true, passPercent: true,
        items: { orderBy: { sortOrder: "asc" }, select: { question: { select: { id: true, type: true, promptAr: true, promptEn: true, options: true, points: true } } } },
      },
    });
    if (!a) throw notFound();
    const attempt = actor.studentId ? await tx.assessmentAttempt.findFirst({ where: { assessmentId: id, studentId: actor.studentId }, orderBy: { attemptNo: "desc" } }) : null;
    return { ...a, attempt };
  });

export const submitSchema = z.object({
  answers: z.array(z.object({ questionId: z.string(), selectedKey: z.string().optional(), textAnswer: z.string().max(4000).optional() })),
});

/** Objective questions grade automatically. Recitation, oral and practical answers return null for a person. */
export function gradeObjective(q: { type: string; correctKey: string | null }, a: { selectedKey?: string | null; textAnswer?: string | null }): number | null {
  if (q.type === "MULTIPLE_CHOICE" || q.type === "TRUE_FALSE") return a.selectedKey === q.correctKey ? 1 : 0;
  if (q.type === "COMPLETE_TEXT") return skeleton(a.textAnswer ?? "") === skeleton(q.correctKey ?? "") ? 1 : 0;
  if (q.type === "ORDER") return (a.textAnswer ?? "") === q.correctKey ? 1 : 0;
  return null;
}

export function scoreAttempt(answers: { points: number; ratio: number | null }[]) {
  const total = answers.reduce((s, a) => s + a.points, 0);
  const pending = answers.some((a) => a.ratio === null);
  const earned = answers.reduce((s, a) => s + a.points * (a.ratio ?? 0), 0);
  return { pending, percent: total ? Math.round((earned / total) * 100) : 0 };
}

/** Choice questions grade automatically. Practical answers wait for a teacher. */
export async function submitAttempt(actor: Actor, assessmentId: string, input: z.infer<typeof submitSchema>) {
  const studentId = actor.studentId;
  if (!studentId) throw forbidden();
  const items = await systemDb().assessmentQuestion.findMany({ where: { assessmentId, assessment: { published: true } }, include: { question: true } });
  if (!items.length) throw notFound();
  const byId = new Map(items.map((i) => [i.questionId, i.question]));
  if (input.answers.some((a) => !byId.has(a.questionId))) throw conflict("unknown_question");
  const given = new Map(input.answers.map((a) => [a.questionId, a]));
  const graded = items.map(({ question: q }) => {
    const a = given.get(q.id);
    const ratio = gradeObjective(q, { selectedKey: a?.selectedKey, textAnswer: a?.textAnswer });
    return { q, a, ratio };
  });
  const result = scoreAttempt(graded.map((g) => ({ points: g.q.points, ratio: g.ratio })));

  const attempt = await withActor(actor, async (tx) => {
    const existing = await tx.assessmentAttempt.findFirst({ where: { assessmentId, studentId }, orderBy: { attemptNo: "desc" } });
    if (existing && existing.status !== "IN_PROGRESS") throw conflict("already_submitted");
    const att = existing ?? (await tx.assessmentAttempt.create({ data: { assessmentId, studentId } }));
    for (const g of graded) {
      await tx.assessmentAnswer.create({
        data: { attemptId: att.id, questionId: g.q.id, selectedKey: g.a?.selectedKey, textAnswer: g.a?.textAnswer, awardedRatio: g.ratio },
      });
    }
    return tx.assessmentAttempt.update({
      where: { id: att.id },
      data: { status: result.pending ? "SUBMITTED" : "GRADED", scorePercent: result.pending ? null : result.percent, submittedAt: new Date() },
    });
  });
  await audit(actor.id, "attempt.submit", "AssessmentAttempt", attempt.id);
  return attempt;
}

export const gradeSchema = z.object({
  grades: z.array(z.object({ questionId: z.string(), ratio: z.coerce.number().min(0).max(1), teacherNote: z.string().max(500).optional() })).min(1),
});

export async function gradeAttempt(actor: Actor, attemptId: string, input: z.infer<typeof gradeSchema>) {
  const attempt = await withActor(actor, async (tx) => {
    const att = await tx.assessmentAttempt.findUnique({ where: { id: attemptId }, include: { answers: { include: { question: { select: { points: true, id: true } } } } } });
    if (!att) throw notFound();
    for (const g of input.grades) {
      await tx.assessmentAnswer.update({ where: { attemptId_questionId: { attemptId, questionId: g.questionId } }, data: { awardedRatio: g.ratio, teacherNote: g.teacherNote } });
    }
    const ratios = new Map(input.grades.map((g) => [g.questionId, g.ratio]));
    const result = scoreAttempt(att.answers.map((a) => ({ points: a.question.points, ratio: ratios.get(a.questionId) ?? a.awardedRatio })));
    if (result.pending) throw conflict("ungraded_answers_remain");
    return tx.assessmentAttempt.update({ where: { id: attemptId }, data: { status: "GRADED", scorePercent: result.percent, gradedById: actor.id } });
  });
  await audit(actor.id, "attempt.grade", "AssessmentAttempt", attemptId);
  const aud = await studentAudience(attempt.studentId);
  await notify([...aud.student, ...aud.guardians], "assessment.graded", { score: attempt.scorePercent ?? 0 });
  return attempt;
}

// ---------- Certificates ----------

export const certificateSchema = z.object({
  studentId: z.string().min(1),
  title: z.string().trim().min(3).max(160),
  scope: z.string().trim().max(300).optional(),
});

export async function requestCertificate(actor: Actor, input: z.infer<typeof certificateSchema>) {
  const c = await withActor(actor, (tx) =>
    tx.certificate.create({ data: { ...input, code: randomBytes(12).toString("hex").toUpperCase(), requestedById: actor.id } }),
  );
  await audit(actor.id, "certificate.request", "Certificate", c.id);
  return c;
}

/** Issuing needs certificates.approve here and again in a database trigger; the requester cannot self-approve. */
export async function decideCertificate(actor: Actor, id: string, approve: boolean) {
  const c = await withActor(actor, async (tx) => {
    const cur = await tx.certificate.findUnique({ where: { id } });
    if (!cur) throw notFound();
    if (cur.status !== "PENDING_APPROVAL") throw conflict("already_decided");
    if (cur.requestedById === actor.id) throw conflict("requester_cannot_approve");
    return tx.certificate.update({
      where: { id },
      data: approve ? { status: "ISSUED", approvedById: actor.id, approvedAt: new Date(), issuedAt: new Date() } : { status: "REJECTED", approvedById: actor.id, approvedAt: new Date() },
    });
  });
  await audit(actor.id, approve ? "certificate.issue" : "certificate.reject", "Certificate", id);
  if (approve) {
    const aud = await studentAudience(c.studentId);
    await notify([...aud.student, ...aud.guardians], "certificate.issued", { title: c.title });
  }
  return c;
}

export async function revokeCertificate(actor: Actor, id: string) {
  const c = await withActor(actor, (tx) => tx.certificate.update({ where: { id }, data: { status: "REVOKED", revokedAt: new Date() } }));
  await audit(actor.id, "certificate.revoke", "Certificate", id);
  return c;
}

/** Public lookup exposes the minimum: first name only, hidden entirely for minors. */
export async function verifyCertificate(code: string) {
  const c = await systemDb().certificate.findUnique({ where: { code }, include: { student: { select: { isMinor: true, user: { select: { name: true } } } } } });
  if (!c || !["ISSUED", "REVOKED"].includes(c.status)) return null;
  return { code: c.code, title: c.title, scope: c.scope, status: c.status, issuedAt: c.issuedAt, revokedAt: c.revokedAt, studentFirstName: c.student.isMinor ? null : c.student.user.name.split(" ")[0] };
}
