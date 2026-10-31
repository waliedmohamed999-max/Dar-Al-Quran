// Public academy content: programs, placement guidance, public search and newsletter.
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { systemDb } from "@/lib/db";
import { env } from "@/lib/env";
import { conflict, forbidden, notFound } from "@/lib/errors";
import type { Actor } from "@/lib/session";
import { skeleton } from "../quran/text";
import { approved } from "@/lib/scholarly";

export const listPrograms = (opts: { featured?: boolean } = {}) =>
  systemDb().program.findMany({ where: { published: true, ...(opts.featured ? { featured: true } : {}) }, orderBy: { sortOrder: "asc" } });

export const getProgram = (slug: string) => systemDb().program.findFirst({ where: { slug, published: true } });

const lines = z.array(z.string().trim().min(1).max(300)).max(20).default([]);
export const programSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]+$/).max(60),
  titleAr: z.string().trim().min(2).max(120),
  titleEn: z.string().trim().min(2).max(120),
  summaryAr: z.string().trim().min(2).max(400),
  summaryEn: z.string().trim().min(2).max(400),
  overviewAr: z.string().trim().min(2).max(4000),
  objectivesAr: lines, audienceAr: lines, levelsAr: lines, curriculumAr: lines, outcomesAr: lines, requirementsAr: lines,
  instructorNoteAr: z.string().trim().max(500).nullable().optional(),
  requiresQualifiedTeachers: z.boolean().default(false),
  featured: z.boolean().default(false),
  published: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

export async function saveProgram(actor: Actor, id: string | null, input: z.infer<typeof programSchema>) {
  if (!actor.perms.has("content.manage")) throw forbidden();
  const p = id ? await systemDb().program.update({ where: { id }, data: input }) : await systemDb().program.create({ data: input });
  await audit(actor.id, id ? "program.update" : "program.create", "Program", p.id);
  return p;
}

// ---------- Placement guidance ----------

export const placementSchema = z.object({
  age: z.enum(["child", "teen", "adult"]),
  reading: z.enum(["none", "letters", "slow", "fluent"]),
  memorized: z.enum(["none", "little", "juz", "many"]),
  tajweed: z.enum(["none", "basic", "good"]),
  schedule: z.enum(["light", "regular", "intensive"]),
});
export type Placement = z.infer<typeof placementSchema>;

/**
 * Preliminary guidance from self-reported answers. It is not stored and is not a level decision:
 * reading ability is confirmed by a teacher after registration.
 */
export function recommendPrograms(a: Placement): { slugs: string[]; dailyMinutes: number; newAyahs: number } {
  const slugs: string[] = [];
  if (a.reading === "none" || a.reading === "letters") slugs.push(a.age === "child" ? "young-readers" : "adult-learning");
  if (a.reading === "slow") slugs.push("recitation");
  if (a.reading === "slow" || a.reading === "fluent") if (a.tajweed !== "good") slugs.push("tajweed");
  if (a.reading === "fluent" || a.reading === "slow") slugs.push(a.memorized === "many" || a.memorized === "juz" ? "revision" : "memorization");
  if (a.schedule === "intensive" && (a.memorized === "many" || a.memorized === "juz")) slugs.push("intensive-revision");
  if (a.reading === "fluent" && a.tajweed === "good") slugs.push("tafsir");
  const dailyMinutes = a.schedule === "light" ? 20 : a.schedule === "regular" ? 40 : 75;
  const newAyahs = a.schedule === "light" ? 2 : a.schedule === "regular" ? 3 : 5;
  return { slugs: [...new Set(slugs)].slice(0, 3), dailyMinutes, newAyahs };
}

// ---------- Public search ----------

export async function publicSearch(q: string, locale: string) {
  const db = systemDb();
  const term = q.trim();
  const sk = skeleton(term);
  const [programs, content, rules, surahs, ayahs] = await Promise.all([
    db.program.findMany({ where: { published: true, OR: [{ titleAr: { contains: term } }, { titleEn: { contains: term, mode: "insensitive" } }, { summaryAr: { contains: term } }, { summaryEn: { contains: term, mode: "insensitive" } }] }, take: 10 }),
    db.contentPage.findMany({ where: { status: "PUBLISHED", locale, type: { in: ["ARTICLE", "NEWS", "EVENT", "LIBRARY", "FAQ"] }, OR: [{ title: { contains: term, mode: "insensitive" } }, { excerpt: { contains: term, mode: "insensitive" } }] }, take: 20 }),
    db.tajweedRule.findMany({ where: { ...approved(), OR: [{ titleAr: { contains: term } }, { titleEn: { contains: term, mode: "insensitive" } }, { bodyAr: { contains: term } }] }, take: 10 }),
    db.quranSurah.findMany({ where: { OR: [{ nameArabic: { contains: term } }, { nameEnglish: { contains: term, mode: "insensitive" } }] }, take: 5 }),
    sk.length >= 3 ? db.quranAyah.findMany({ where: { searchText: { contains: sk } }, orderBy: { id: "asc" }, take: 8, select: { id: true, surahId: true, ayahNumber: true, text: true } }) : Promise.resolve([]),
  ]);
  return { programs, content, rules, surahs, ayahs };
}

// ---------- Newsletter with confirmed opt-in ----------

export const subscribeSchema = z.object({ email: z.email().toLowerCase(), consent: z.literal(true), locale: z.enum(["ar", "en"]).default("ar") });

/** Same response whether or not the address already exists, and nothing is sent without confirmation. */
export async function subscribe(input: z.infer<typeof subscribeSchema>) {
  const db = systemDb();
  const existing = await db.newsletterSubscriber.findUnique({ where: { email: input.email } });
  if (existing?.confirmedAt && !existing.unsubscribedAt) return { ok: true };
  const token = randomBytes(24).toString("base64url");
  await db.newsletterSubscriber.upsert({
    where: { email: input.email },
    update: { confirmToken: token, unsubscribedAt: null, locale: input.locale },
    create: { email: input.email, confirmToken: token, unsubToken: randomBytes(24).toString("base64url"), consentAt: new Date(), locale: input.locale },
  });
  const link = `${env.appUrl}/newsletter?confirm=${token}`;
  await db.job.create({ data: { type: "email.raw", payload: { to: input.email, subject: "تأكيد الاشتراك | Confirm subscription", html: `<div dir="rtl"><p>لتأكيد الاشتراك في نشرة دار القرآن الكريم:</p><p><a href="${link}">${link}</a></p></div>` } } });
  return { ok: true };
}

export async function confirmNewsletter(token: string) {
  const r = await systemDb().newsletterSubscriber.updateMany({ where: { confirmToken: token, confirmedAt: null }, data: { confirmedAt: new Date() } });
  return r.count > 0;
}

export async function unsubscribe(token: string) {
  const r = await systemDb().newsletterSubscriber.updateMany({ where: { unsubToken: token }, data: { unsubscribedAt: new Date() } });
  return r.count > 0;
}

// ---------- Library favourites ----------

export async function toggleLibraryFavorite(actor: Actor, contentId: string) {
  const db = systemDb();
  const item = await db.contentPage.findFirst({ where: { id: contentId, status: "PUBLISHED", type: "LIBRARY" }, select: { id: true } });
  if (!item) throw notFound();
  const key = { userId_contentId: { userId: actor.id, contentId } };
  if (await db.libraryFavorite.findUnique({ where: key })) {
    await db.libraryFavorite.delete({ where: key });
    return { active: false };
  }
  await db.libraryFavorite.create({ data: { userId: actor.id, contentId } });
  return { active: true };
}

// ---------- Editable lessons ----------

export const lessonSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]+$/).max(60),
  category: z.string().trim().min(2).max(40),
  level: z.coerce.number().int().min(1).max(10),
  titleAr: z.string().trim().min(2).max(160),
  titleEn: z.string().trim().min(2).max(160),
  bodyAr: z.string().trim().min(10).max(8000),
  bodyEn: z.string().trim().min(10).max(8000),
  videoUrl: z.url({ protocol: /^https$/ }).nullable().optional(),
  audioUrl: z.url({ protocol: /^https$/ }).nullable().optional(),
  mediaSource: z.string().trim().max(200).nullable().optional(),
  mediaLicense: z.string().trim().max(300).nullable().optional(),
}).refine((l) => !(l.videoUrl || l.audioUrl) || Boolean(l.mediaSource && l.mediaLicense), "media needs its source and licence");

/** Any edit returns the lesson to pending, so changed text is reviewed before publication. */
export async function saveLesson(actor: Actor, id: string | null, input: z.infer<typeof lessonSchema>) {
  if (!actor.perms.has("content.manage")) throw forbidden();
  const db = systemDb();
  const reset = { reviewStatus: "PENDING" as const, reviewedBy: null, reviewedAt: null };
  if (!id && (await db.tajweedRule.findUnique({ where: { slug: input.slug } }))) throw conflict("conflict");
  const row = id
    ? await db.tajweedRule.update({ where: { id }, data: { ...input, ...reset } })
    : await db.tajweedRule.create({ data: { ...input, ...reset, riwayaId: 1, sortOrder: (await db.tajweedRule.count()) + 1 } });
  await audit(actor.id, id ? "lesson.update" : "lesson.create", "TajweedRule", row.id);
  return row;
}

/** Real public figures only. Sections hide themselves when the school chooses, or when there is no data. */
export async function publicCounts() {
  const db = systemDb();
  const [surahs, ayahs, recitations, lessons] = await Promise.all([db.quranSurah.count(), db.quranAyah.count(), db.recitation.count({ where: { active: true } }), db.tajweedRule.count({ where: { ...approved() } })]);
  return { surahs, ayahs, recitations, lessons };
}
