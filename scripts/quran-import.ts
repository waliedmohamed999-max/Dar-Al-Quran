// Imports data/quran/raw into the database and writes the integrity manifest.
// The manifest is committed, so any later change to stored text is detectable.
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { alignTajweed, separateBismillah, sha256, skeleton } from "../src/modules/quran/text";

const read = (f: string) => JSON.parse(readFileSync(`data/quran/raw/${f}`, "utf8"));

async function main() {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const uthmani = read("quran-uthmani.json").data.surahs;
  const tajweed = read("quran-tajweed.json").data.surahs;
  const chapters = read("chapters.json").chapters;
  const cross = new Map<string, string>(read("crosscheck-uthmani.json").verses.map((v: { verse_key: string; text_uthmani: string }) => [v.verse_key, v.text_uthmani]));

  await db.riwaya.upsert({ where: { id: 1 }, update: {}, create: { id: 1, key: "hafs-asim", nameAr: "حفص عن عاصم", nameEn: "Hafs from Asim" } });

  const ayahRows = [];
  const annotationRows = [];
  const crossDiffs: string[] = [];
  const surahHashes: Record<string, string> = {};
  let unaligned = 0;

  for (const s of uthmani) {
    const chapter = chapters.find((c: { id: number }) => c.id === s.number);
    await db.quranSurah.upsert({
      where: { id: s.number },
      update: {},
      create: {
        id: s.number,
        nameArabic: chapter.name_arabic,
        nameEnglish: chapter.name_simple,
        meaningEnglish: s.englishNameTranslation,
        revelationPlace: chapter.revelation_place === "makkah" ? "MAKKAH" : "MADINAH",
        ayahCount: s.ayahs.length,
        bismillahPre: chapter.bismillah_pre,
      },
    });
    const parts: string[] = [];
    for (const a of s.ayahs) {
      const text = separateBismillah(s.number, a.numberInSurah, a.text);
      parts.push(text);
      const key = `${s.number}:${a.numberInSurah}`;
      if (skeleton(cross.get(key) ?? "") !== skeleton(text)) crossDiffs.push(key);
      ayahRows.push({
        id: a.number,
        riwayaId: 1,
        surahId: s.number,
        ayahNumber: a.numberInSurah,
        text,
        searchText: skeleton(text),
        sha256: sha256(text),
        juz: a.juz,
        hizb: Math.ceil(a.hizbQuarter / 4),
        rubAlHizb: a.hizbQuarter,
        page: a.page,
        sajda: Boolean(a.sajda),
      });
      const markup = tajweed[s.number - 1].ayahs[a.numberInSurah - 1].text;
      const spans = alignTajweed(text, markup);
      if (spans) annotationRows.push({ ayahId: a.number, markup: JSON.stringify(spans), source: "cpfair/quran-tajweed (CC BY 4.0)" });
      else unaligned += 1;
    }
    surahHashes[s.number] = sha256(parts.join("\n"));
  }

  await db.quranAyah.createMany({ data: ayahRows, skipDuplicates: true });
  await db.tajweedAnnotation.createMany({ data: annotationRows, skipDuplicates: true });

  const pages = new Map<number, { first: number; last: number; juz: number }>();
  for (const r of ayahRows) {
    const p = pages.get(r.page);
    if (!p) pages.set(r.page, { first: r.id, last: r.id, juz: r.juz });
    else p.last = r.id;
  }
  await db.quranPage.createMany({
    data: [...pages].map(([number, p]) => ({ number, firstAyahId: p.first, lastAyahId: p.last, juz: p.juz })),
    skipDuplicates: true,
  });

  const manifest = {
    source: "Tanzil Quran Text (Uthmani) via api.alquran.cloud edition quran-uthmani",
    riwaya: "hafs-asim",
    bismillahHandling: "Heading words removed from ayah 1 of surahs other than 1 and 9",
    counts: { surahs: uthmani.length, ayahs: ayahRows.length, pages: pages.size, juz: new Set(ayahRows.map((r) => r.juz)).size, rub: new Set(ayahRows.map((r) => r.rubAlHizb)).size, sajda: ayahRows.filter((r) => r.sajda).length },
    allTextSha256: sha256(ayahRows.map((r) => r.text).join("\n")),
    surahSha256: surahHashes,
    crossCheck: { against: "api.quran.com text_uthmani (letter skeleton)", differences: crossDiffs },
    tajweed: { aligned: annotationRows.length, unaligned },
  };
  writeFileSync("data/quran/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
  console.log(manifest.counts, manifest.crossCheck, manifest.tajweed);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
