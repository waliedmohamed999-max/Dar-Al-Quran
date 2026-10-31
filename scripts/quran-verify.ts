// Exits non-zero if stored text differs from the committed manifest or expected Quran totals.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { sha256 } from "../src/modules/quran/text";

async function main() {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const manifest = JSON.parse(readFileSync("data/quran/manifest.json", "utf8"));
  const ayahs = await db.quranAyah.findMany({ orderBy: { id: "asc" } });
  const errors: string[] = [];
  const expect = (name: string, got: unknown, want: unknown) => { if (got !== want) errors.push(`${name}: got ${got}, want ${want}`); };

  expect("ayahs", ayahs.length, 6236);
  expect("surahs", new Set(ayahs.map((a) => a.surahId)).size, 114);
  expect("pages", new Set(ayahs.map((a) => a.page)).size, 604);
  expect("juz", new Set(ayahs.map((a) => a.juz)).size, 30);
  expect("hizb", new Set(ayahs.map((a) => a.hizb)).size, 60);
  expect("rub", new Set(ayahs.map((a) => a.rubAlHizb)).size, 240);
  for (const a of ayahs) if (sha256(a.text) !== a.sha256) errors.push(`hash mismatch ${a.surahId}:${a.ayahNumber}`);
  expect("all text hash", sha256(ayahs.map((a) => a.text).join("\n")), manifest.allTextSha256);
  for (const [surah, hash] of Object.entries(manifest.surahSha256)) {
    const text = ayahs.filter((a) => a.surahId === Number(surah)).map((a) => a.text).join("\n");
    expect(`surah ${surah}`, sha256(text), hash);
  }
  await db.$disconnect();
  if (errors.length) { console.error("QURAN TEXT VERIFICATION FAILED", errors); process.exit(1); }
  console.log(`OK: ${ayahs.length} ayahs match manifest ${manifest.allTextSha256.slice(0, 16)}...`);
  console.log(`Known cross-source differences awaiting scholarly review: ${manifest.crossCheck.differences.join(", ")}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
