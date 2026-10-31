import { systemDb, withActor } from "@/lib/db";
import { env } from "@/lib/env";
import { badRequest, notFound } from "@/lib/errors";
import type { Actor } from "@/lib/session";
import { tafsirAdapterFor } from "./adapters";
import { skeleton, type TajweedSpan } from "./text";
import { approved, approvedSource } from "@/lib/scholarly";
import { tajweedColoursEnabled } from "@/lib/scholarly";

const RIWAYA = 1;

export const listSurahs = () => systemDb().quranSurah.findMany({ orderBy: { id: "asc" } });

export const listRecitations = () =>
  systemDb().recitation.findMany({ where: { active: true }, include: { reciter: true }, orderBy: { id: "asc" } });

export async function ayahsWhere(where: { surahId?: number; page?: number; juz?: number; hizb?: number }) {
  const rows = await systemDb().quranAyah.findMany({
    where: { riwayaId: RIWAYA, ...where },
    orderBy: { id: "asc" },
    include: { tajweed: { select: { markup: true } } },
  });
  const colours = tajweedColoursEnabled();
  return rows.map((a) => ({
    id: a.id,
    surahId: a.surahId,
    ayahNumber: a.ayahNumber,
    text: a.text,
    page: a.page,
    juz: a.juz,
    hizb: a.hizb,
    sajda: a.sajda,
    spans: a.tajweed && colours ? (JSON.parse(a.tajweed.markup) as TajweedSpan[]) : null,
  }));
}
export type AyahView = Awaited<ReturnType<typeof ayahsWhere>>[number];

/** The heading is read from the stored text of 1:1, never typed into the UI. */
export const basmalaText = async () => (await systemDb().quranAyah.findUniqueOrThrow({ where: { id: 1 }, select: { text: true } })).text;

export async function juzIndex() {
  const rows = await systemDb().$queryRaw<{ juz: number; surahId: number; ayahNumber: number; page: number }[]>`
    SELECT DISTINCT ON (juz) juz, "surahId", "ayahNumber", page FROM quran_ayahs ORDER BY juz, id`;
  return rows;
}

export async function searchAyahs(q: string, take = 30) {
  const term = skeleton(q);
  if (term.length < 2) throw badRequest("query_too_short");
  // Prisma's contains parameterizes and escapes the pattern.
  const [total, rows] = await Promise.all([
    systemDb().quranAyah.count({ where: { searchText: { contains: term } } }),
    systemDb().quranAyah.findMany({
      where: { searchText: { contains: term } },
      orderBy: { id: "asc" },
      take,
      select: { id: true, surahId: true, ayahNumber: true, text: true, page: true, surah: { select: { nameArabic: true, nameEnglish: true } } },
    }),
  ]);
  return { total, rows };
}

export const approvedTafsirSources = () =>
  systemDb().tafsirSource.findMany({ where: { ...approvedSource() }, orderBy: [{ beginner: "desc" }, { id: "asc" }] });

/** Serves one ayah's tafsir from cache, or the adapter. Only sources that passed scholarly review. */
export async function tafsirFor(ayahId: number, sourceSlug: string) {
  const db = systemDb();
  const source = await db.tafsirSource.findFirst({ where: { slug: sourceSlug, ...approvedSource() } });
  if (!source) throw notFound();
  const ayah = await db.quranAyah.findUnique({ where: { id: ayahId } });
  if (!ayah) throw notFound();
  const cached = await db.tafsirEntry.findUnique({ where: { sourceId_ayahId: { sourceId: source.id, ayahId } } });
  const fresh = cached && (!cached.expiresAt || cached.expiresAt > new Date());
  const meta = { source: { slug: source.slug, nameAr: source.nameAr, nameEn: source.nameEn, author: source.author, licenseNote: source.licenseNote } };
  if (fresh) return { ...meta, text: cached.text };

  const text = await tafsirAdapterFor(source.adapterRef)
    .fetchAyah(source.adapterRef, ayah.surahId, ayah.ayahNumber)
    .catch((e) => {
      console.error("[tafsir] provider error", (e as Error).message);
      return null;
    });
  if (!text) return { ...meta, text: null };
  const expiresAt = new Date(Date.now() + env.cacheDays * 86400000);
  await db.tafsirEntry.upsert({
    where: { sourceId_ayahId: { sourceId: source.id, ayahId } },
    update: { text, fetchedAt: new Date(), expiresAt },
    create: { sourceId: source.id, ayahId, text, expiresAt },
  });
  return { ...meta, text };
}

export async function rulesForAyah(ayahId: number) {
  const db = systemDb();
  const annotation = await db.tajweedAnnotation.findUnique({ where: { ayahId } });
  if (!annotation) return [];
  const codes = [...new Set((JSON.parse(annotation.markup) as TajweedSpan[]).map((s) => s[2]))];
  return db.tajweedRule.findMany({
    where: { markupCode: { in: codes }, ...approved() },
    select: { slug: true, titleAr: true, titleEn: true, markupCode: true },
    orderBy: { sortOrder: "asc" },
  });
}

export const toggleBookmark = (actor: Actor, ayahId: number, kind: "FAVORITE" | "BOOKMARK") =>
  withActor(actor, async (tx) => {
    const key = { userId_ayahId_kind: { userId: actor.id, ayahId, kind } };
    const existing = await tx.bookmark.findUnique({ where: key });
    if (existing) {
      await tx.bookmark.delete({ where: key });
      return { active: false };
    }
    await tx.bookmark.create({ data: { userId: actor.id, ayahId, kind } });
    return { active: true };
  });

export const savePosition = (actor: Actor, ayahId: number) =>
  withActor(actor, (tx) =>
    tx.readingPosition.upsert({ where: { userId: actor.id }, update: { ayahId }, create: { userId: actor.id, ayahId } }),
  );

export const myQuranState = (actor: Actor) =>
  withActor(actor, async (tx) => {
    const [position, bookmarks] = await Promise.all([
      tx.readingPosition.findUnique({ where: { userId: actor.id }, include: { ayah: { select: { surahId: true, ayahNumber: true, page: true } } } }),
      tx.bookmark.findMany({
        where: { userId: actor.id },
        orderBy: { createdAt: "desc" },
        include: { ayah: { select: { id: true, surahId: true, ayahNumber: true, text: true, surah: { select: { nameArabic: true, nameEnglish: true } } } } },
      }),
    ]);
    return { position, bookmarks };
  });

/** Colours load only when a reader opens a mode that shows them, so plain reading stays light. */
export async function spansFor(from: number, to: number) {
  if (!tajweedColoursEnabled() || to < from || to - from > 800) return {};
  const rows = await systemDb().tajweedAnnotation.findMany({ where: { ayahId: { gte: from, lte: to } }, select: { ayahId: true, markup: true } });
  return Object.fromEntries(rows.map((r) => [r.ayahId, JSON.parse(r.markup) as TajweedSpan[]]));
}

/** Null when no licensed timing exists for this recitation. The reader then highlights the ayah only. */
export async function wordTimings(slug: string, surahId: number, ayahNumber: number) {
  const r = await systemDb().recitation.findUnique({ where: { slug }, select: { id: true } });
  if (!r || !Number.isInteger(surahId) || !Number.isInteger(ayahNumber)) return null;
  const row = await systemDb().ayahWordTiming.findUnique({ where: { recitationId_surahId_ayahNumber: { recitationId: r.id, surahId, ayahNumber } }, select: { segments: true } });
  return row ? { segments: row.segments as [number, number, number, number][] } : null;
}
