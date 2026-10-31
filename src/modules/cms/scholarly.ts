// The central scholarly queue. Reads every reviewable kind into one list. Decisions stay with people.
import { createHash } from "node:crypto";
import { systemDb } from "@/lib/db";
import { conflict, forbidden, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";
import type { Actor } from "@/lib/session";
import type { ScholarlyTarget } from "./service";

export type ReviewItem = { target: ScholarlyTarget; id: string; title: string; text: string; source: string; license: string; status: string; reviewedBy: string | null; reviewedAt: Date | null; blocker: "grade" | "takhrij" | null; quotes: string | null };

const needScholar = (actor: Actor) => { if (!actor.perms.has("scholarly.review")) throw forbidden(); };

export async function reviewItems(actor: Actor): Promise<ReviewItem[]> {
  needScholar(actor);
  const db = systemDb();
  const [dhikr, hadith, rules, examples, sources, study] = await Promise.all([
    db.dhikr.findMany({ orderBy: { sortOrder: "asc" } }),
    db.hadithEntry.findMany({ orderBy: { number: "asc" }, include: { collection: { select: { titleAr: true, sourceName: true, licenseNote: true } } } }),
    db.tajweedRule.findMany({ orderBy: { sortOrder: "asc" } }),
    db.tajweedExample.findMany({ include: { rule: { select: { titleAr: true } }, ayah: { select: { surahId: true, ayahNumber: true } } } }),
    db.tafsirSource.findMany({ orderBy: { id: "asc" } }),
    db.studyResource.findMany({ orderBy: { createdAt: "asc" } }),
  ]);
  return [
    ...dhikr.map((d) => ({ target: "dhikr" as const, id: d.id, title: d.titleAr, text: d.text, source: `${d.sourceName}${d.takhrij ? ` · ${d.takhrij}` : ""}`, license: d.licenseNote, status: d.reviewStatus, reviewedBy: d.reviewedBy, reviewedAt: d.reviewedAt, blocker: d.takhrij ? null : ("takhrij" as const), quotes: Array.isArray(d.quoteCheck) && d.quoteCheck.length ? (d.quoteCheck as { surahId: number; ayahNumber: number }[]).map((q) => `${q.surahId}:${q.ayahNumber}`).join("، ") : null })),
    ...hadith.map((h) => ({ target: "hadith" as const, id: h.id, title: `${h.collection.titleAr}: ${h.number}`, text: h.text, source: `${h.collection.sourceName}${h.gradeSource ? ` · ${h.grade} (${h.gradeSource})` : ""}`, license: h.collection.licenseNote, status: h.reviewStatus, reviewedBy: h.reviewedBy, reviewedAt: h.reviewedAt, blocker: h.grade && h.gradeSource ? null : ("grade" as const), quotes: null })),
    ...rules.map((r) => ({ target: "tajweed_rule" as const, id: r.id, title: r.titleAr, text: r.bodyAr, source: r.mediaSource ?? "نص درس أعد للمراجعة", license: r.mediaLicense ?? "—", status: r.reviewStatus, reviewedBy: r.reviewedBy, reviewedAt: r.reviewedAt, blocker: null, quotes: null })),
    ...examples.map((e) => ({ target: "tajweed_example" as const, id: e.id, title: `${e.rule.titleAr}: ${e.ayah.surahId}:${e.ayah.ayahNumber}`, text: e.excerpt, source: "مرشح آلياً من cpfair/quran-tajweed", license: "CC BY 4.0", status: e.reviewStatus, reviewedBy: e.reviewedBy, reviewedAt: null, blocker: null, quotes: null })),
    ...sources.map((s) => ({ target: "tafsir_source" as const, id: String(s.id), title: s.nameAr, text: s.author, source: s.author, license: s.licenseNote, status: s.status, reviewedBy: s.reviewedBy, reviewedAt: s.reviewedAt, blocker: null, quotes: null })),
    ...study.map((r) => ({ target: "study_resource" as const, id: r.id, title: `${r.surahId}:${r.fromAyah}–${r.toAyah}${r.term ? ` ${r.term}` : ""}`, text: r.body, source: `${r.sourceName}، ${r.sourceRef}`, license: r.licenseNote, status: r.reviewStatus, reviewedBy: r.reviewedBy, reviewedAt: r.reviewedAt, blocker: null, quotes: null })),
  ];
}

export async function itemHistory(actor: Actor, target: ScholarlyTarget, id: string) {
  needScholar(actor);
  const db = systemDb();
  const [reviews, assignment, edits] = await Promise.all([
    db.contentReview.findMany({ where: { targetType: target, targetId: id }, orderBy: { createdAt: "desc" } }),
    db.reviewAssignment.findUnique({ where: { targetType_targetId: { targetType: target, targetId: id } } }),
    db.auditLog.findMany({ where: { entityId: id, action: { in: ["dhikr.update", "dhikr.create", "hadith.edit", "lesson.update", "lesson.create", "study_resource.update", "study_resource.create"] } }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, action: true, createdAt: true, actorId: true } }),
  ]);
  const ids = [...new Set([...reviews.map((r) => r.reviewerId), ...edits.map((e) => e.actorId), assignment?.reviewerId].filter(Boolean) as string[])];
  const users = new Map((await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return { reviews, assignment, edits, nameOf: Object.fromEntries(users) as Record<string, string> };
}

export const scholars = async (actor: Actor) => {
  needScholar(actor);
  return systemDb().user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { permissions: { some: { permission: { key: "scholarly.review" } } } } } } }, select: { id: true, name: true } });
};

export async function assignReviewer(actor: Actor, target: ScholarlyTarget, id: string, reviewerId: string) {
  needScholar(actor);
  const ok = (await scholars(actor)).some((s) => s.id === reviewerId);
  if (!ok) throw conflict("reviewer_not_eligible");
  await systemDb().reviewAssignment.upsert({ where: { targetType_targetId: { targetType: target, targetId: id } }, update: { reviewerId, assignedById: actor.id }, create: { targetType: target, targetId: id, reviewerId, assignedById: actor.id } });
  await audit(actor.id, "scholarly.assign", target, id, { reviewerId });
}

/** Records who decided what about which exact text. The hash shows whether the text changed afterwards. */
export async function recordDecision(actor: Actor, target: ScholarlyTarget, id: string, approve: boolean, reason: string | undefined, text: string) {
  const row = await systemDb().contentReview.create({ data: { targetType: target, targetId: id, decision: approve ? "APPROVED" : "REJECTED", reason: reason ?? null, reviewerId: actor.id, contentSha: createHash("sha256").update(text, "utf8").digest("hex") } });
  if (!row) throw notFound();
  return row;
}
