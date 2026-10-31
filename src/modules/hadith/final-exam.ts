// The final exam of a hadith track. Questions come verbatim from approved stored text, and recitation
// is graded by a person, so an exam can exist only once the whole collection has been reviewed.
import { randomInt } from "node:crypto";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { systemDb } from "@/lib/db";
import { conflict, forbidden, notFound } from "@/lib/errors";
import { approved } from "@/lib/scholarly";
import type { Actor } from "@/lib/session";

/** Splits at a word boundary, so the student completes the ending. Concatenating restores the text. */
export function completionParts(text: string, tail = 5) {
  const words = text.trim().split(/\s+/);
  const cut = Math.max(1, words.length - tail);
  return { shown: words.slice(0, cut).join(" "), expected: words.slice(cut).join(" ") };
}

export const finalExamSchema = z.object({
  completionCount: z.coerce.number().int().min(1).max(42).default(10),
  recitationCount: z.coerce.number().int().min(1).max(42).default(5),
  passPercent: z.coerce.number().int().min(1).max(100).default(70),
  durationMin: z.coerce.number().int().min(5).max(600).default(60),
  opensAt: z.coerce.date(), closesAt: z.coerce.date(),
}).refine((x) => x.opensAt < x.closesAt, "invalid dates");

/** Refuses a track with any unreviewed hadith. The result stays a draft until a reviewer publishes it. */
export async function buildFinalExam(actor: Actor, collectionId: string, input: z.infer<typeof finalExamSchema>) {
  if (!actor.perms.has("assessments.manage")) throw forbidden();
  const db = systemDb();
  const col = await db.hadithCollection.findUnique({ where: { id: collectionId }, include: { entries: { orderBy: { number: "asc" } } } });
  if (!col) throw notFound();
  if (col.finalCompetitionId) throw conflict("final_exam_exists");
  const good = await db.hadithEntry.findMany({ where: { collectionId, ...approved() }, orderBy: { number: "asc" } });
  if (!good.length || good.length !== col.entries.length) throw conflict("collection_not_fully_reviewed");
  const pick = <T,>(a: T[], n: number) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = randomInt(0, i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b.slice(0, Math.min(n, b.length)); };
  const ids: string[] = [];
  for (const h of pick(good, input.completionCount)) {
    const p = completionParts(h.text);
    ids.push((await db.question.create({ data: { kind: "MEMORIZATION", type: "COMPLETE_TEXT", tag: `hadith-final:${col.slug}`, promptAr: `أكمل الحديث رقم ${h.number} من ${col.titleAr}: ${p.shown} …`, correctKey: p.expected, points: 1 } })).id);
  }
  for (const h of pick(good, input.recitationCount)) {
    ids.push((await db.question.create({ data: { kind: "MEMORIZATION", type: "RECITATION", tag: `hadith-final:${col.slug}`, promptAr: `سمّع الحديث رقم ${h.number} من ${col.titleAr} من حفظك.`, points: 2 } })).id);
  }
  const assessment = await db.assessment.create({ data: { title: `الاختبار النهائي: ${col.titleAr}`, kind: "MEMORIZATION", createdById: actor.id, published: false, passPercent: input.passPercent, items: { create: ids.map((questionId, sortOrder) => ({ questionId, sortOrder })) } } });
  const c = await db.competition.create({
    data: {
      slug: `final-${col.slug}-${Date.now().toString(36)}`, title: `الاختبار النهائي: ${col.titleAr}`, description: `اختبار نهائي لمسار ${col.titleAr}: إكمال نصوص وتسميع يقيمه معلم. النتيجة لا تصدر شهادة تلقائياً.`,
      kind: "hadith", level: "intermediate", criteria: `النجاح من ${input.passPercent}%. يصحح الإكمال آلياً على النص المعتمد، ويقيم المعلم التسميع.`, resultsMethod: "تظهر النتيجة للطالب بعد تقييم المعلم، ثم تعتمد الشهادة بقرار مخول.",
      registrationOpensAt: new Date(), registrationClosesAt: input.closesAt, examStartsAt: input.opensAt, examEndsAt: input.closesAt, durationMin: input.durationMin, published: false, assessmentId: assessment.id, createdById: actor.id,
    },
  });
  await db.hadithCollection.update({ where: { id: collectionId }, data: { finalCompetitionId: c.id } });
  await audit(actor.id, "hadith.final_exam.build", "HadithCollection", collectionId);
  return c;
}

/** A scholarly reviewer publishes, and only while every hadith remains approved. */
export async function publishFinalExam(actor: Actor, collectionId: string) {
  if (!actor.perms.has("scholarly.review")) throw forbidden();
  const db = systemDb();
  const col = await db.hadithCollection.findUnique({ where: { id: collectionId }, include: { _count: { select: { entries: true } } } });
  if (!col?.finalCompetitionId) throw notFound();
  if ((await db.hadithEntry.count({ where: { collectionId, ...approved() } })) !== col._count.entries) throw conflict("collection_not_fully_reviewed");
  const c = await db.competition.update({ where: { id: col.finalCompetitionId }, data: { published: true } });
  await db.assessment.update({ where: { id: c.assessmentId }, data: { published: true } });
  await audit(actor.id, "hadith.final_exam.publish", "HadithCollection", collectionId);
  return c;
}
