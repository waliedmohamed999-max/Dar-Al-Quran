import { z } from "zod";
import { audit } from "@/lib/audit";
import { systemDb, withActor } from "@/lib/db";
import { conflict, forbidden, notFound } from "@/lib/errors";
import { sanitizeBody } from "@/lib/sanitize";
import type { Actor } from "@/lib/session";
import type { ContentType } from "@/generated/prisma/enums";
import { recordDecision } from "./scholarly";

export const contentSchema = z.object({
  type: z.enum(["PAGE", "ARTICLE", "NEWS", "FAQ", "TESTIMONIAL", "LIBRARY", "EVENT"]),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/).max(100),
  locale: z.enum(["ar", "en"]),
  title: z.string().trim().min(2).max(200),
  excerpt: z.string().trim().max(400).optional(),
  body: z.string().min(1).max(100000),
  sortOrder: z.coerce.number().int().default(0),
  category: z.string().trim().max(40).optional(),
  imageUrl: z.url({ protocol: /^https$/ }).optional(),
  mediaUrl: z.url({ protocol: /^https$/ }).optional(),
  featured: z.boolean().default(false),
  seoTitle: z.string().trim().max(160).optional(),
  seoDescription: z.string().trim().max(300).optional(),
});

export async function upsertContent(actor: Actor, id: string | null, input: z.infer<typeof contentSchema>) {
  const data = { ...input, body: sanitizeBody(input.body) };
  const row = await withActor(actor, async (tx) => {
    if (id) {
      const cur = await tx.contentPage.findUnique({ where: { id } });
      if (!cur) throw notFound();
      // Editing published content sends it back through review.
      return tx.contentPage.update({ where: { id }, data: { ...data, status: cur.status === "PUBLISHED" ? "IN_REVIEW" : cur.status } });
    }
    return tx.contentPage.create({ data: { ...data, authorId: actor.id } });
  });
  await audit(actor.id, id ? "content.update" : "content.create", "ContentPage", row.id);
  return row;
}

/** Publishing needs content.review and must come from the IN_REVIEW state. */
export async function transitionContent(actor: Actor, id: string, status: "DRAFT" | "IN_REVIEW" | "PUBLISHED" | "ARCHIVED") {
  if (status === "PUBLISHED" && !actor.perms.has("content.review")) throw forbidden();
  const row = await withActor(actor, async (tx) => {
    const cur = await tx.contentPage.findUnique({ where: { id } });
    if (!cur) throw notFound();
    if (status === "PUBLISHED" && cur.status !== "IN_REVIEW") throw conflict("must_be_in_review");
    return tx.contentPage.update({
      where: { id },
      data: { status, ...(status === "PUBLISHED" ? { publishedAt: new Date(), reviewedBy: actor.id } : {}) },
    });
  });
  await audit(actor.id, "content.status", "ContentPage", id, { status });
  return row;
}

export const publicContent = (type: ContentType, locale: string, take = 50) =>
  systemDb().contentPage.findMany({
    where: { type, locale, status: "PUBLISHED" },
    orderBy: [{ sortOrder: "asc" }, { publishedAt: "desc" }],
    take,
  });

export const publicPage = (type: ContentType, slug: string, locale: string) =>
  systemDb().contentPage.findFirst({ where: { type, slug, locale, status: "PUBLISHED" } });

// ---------- Scholarly review of imported or authored religious content ----------

export type ScholarlyTarget = "tafsir_source" | "tajweed_rule" | "tajweed_example" | "dhikr" | "hadith" | "study_resource";

async function reviewedText(target: ScholarlyTarget, id: string) {
  const db = systemDb();
  if (target === "dhikr") return (await db.dhikr.findUnique({ where: { id } }))?.text ?? "";
  if (target === "hadith") return (await db.hadithEntry.findUnique({ where: { id } }))?.text ?? "";
  if (target === "tajweed_rule") return (await db.tajweedRule.findUnique({ where: { id } }))?.bodyAr ?? "";
  if (target === "tajweed_example") return (await db.tajweedExample.findUnique({ where: { id } }))?.excerpt ?? "";
  if (target === "study_resource") return (await db.studyResource.findUnique({ where: { id } }))?.body ?? "";
  return (await db.tafsirSource.findUnique({ where: { id: Number(id) } }))?.nameAr ?? "";
}

export async function scholarlyDecision(actor: Actor, target: ScholarlyTarget, id: string, approve: boolean, reason?: string) {
  if (!actor.perms.has("scholarly.review")) throw forbidden();
  const db = systemDb();
  if (!approve && !reason?.trim()) throw conflict("rejection_reason_required");
  const value = approve ? "APPROVED" : "REJECTED";
  if (approve && target === "hadith") {
    // A hadith cannot be approved undocumented: its grade and the reference for that grade come first.
    const h = await db.hadithEntry.findUnique({ where: { id } });
    if (!h?.grade || !h.gradeSource) throw conflict("hadith_grade_required");
  }
  if (approve && target === "dhikr") {
    const d = await db.dhikr.findUnique({ where: { id } });
    if (!d?.takhrij) throw conflict("dhikr_takhrij_required");
  }
  const stamp = { reviewedBy: actor.id };
  if (target === "tafsir_source") await db.tafsirSource.update({ where: { id: Number(id) }, data: { status: value, reviewedAt: new Date(), ...stamp } });
  if (target === "tajweed_rule") await db.tajweedRule.update({ where: { id }, data: { reviewStatus: value, reviewedAt: new Date(), ...stamp } });
  if (target === "tajweed_example") await db.tajweedExample.update({ where: { id }, data: { reviewStatus: value, ...stamp } });
  if (target === "dhikr") await db.dhikr.update({ where: { id }, data: { reviewStatus: value, reviewedAt: new Date(), ...stamp } });
  if (target === "hadith") await db.hadithEntry.update({ where: { id }, data: { reviewStatus: value, reviewedAt: new Date(), ...stamp } });
  if (target === "study_resource") await db.studyResource.update({ where: { id }, data: { reviewStatus: value, reviewedAt: new Date(), ...stamp } });
  await recordDecision(actor, target, id, approve, reason?.trim(), await reviewedText(target, id));
  await audit(actor.id, "scholarly.decision", target, id, { value });
}

// ---------- Settings ----------

export const PUBLIC_SETTINGS = ["brand", "contact", "calendar"] as const;

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await systemDb().setting.findUnique({ where: { key } });
  return (row?.value as T) ?? fallback;
}

export const settingsSchema = z.object({
  brand: z.object({ nameAr: z.string().min(2).max(100), nameEn: z.string().min(2).max(100), logoUrl: z.url({ protocol: /^https$/ }).or(z.literal("")).optional() }).optional(),
  contact: z.object({ email: z.email().or(z.literal("")).optional(), phone: z.string().max(40).optional(), address: z.string().max(300).optional() }).optional(),
  calendar: z.object({ weekStartsOn: z.coerce.number().int().min(0).max(6), timezoneOffsetMin: z.coerce.number().int().min(-720).max(840) }).optional(),
});

export async function updateSettings(actor: Actor, input: z.infer<typeof settingsSchema>) {
  await withActor(actor, async (tx) => {
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      await tx.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
    }
  });
  await audit(actor.id, "settings.update", "Setting", null, { keys: Object.keys(input) });
}
