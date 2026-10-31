// Imports word timings from cpfair/quran-align (CC BY 4.0) for recitations with the exact same audio folder.
// Other bitrates of a reciter are skipped: nothing confirms they are the same edit of the recording.
import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { unzipSync } from "fflate";
import { PrismaClient } from "../src/generated/prisma/client";

const URL = "https://github.com/cpfair/quran-align/releases/download/release-2016-11-24/quran-align-data-2016-11-24.zip";
const SHA = "5eeb045d8a7895208c94d2d7ec243567f8f550728835411527c4ffa1e789c9b7";
const SOURCE = "cpfair/quran-align release-2016-11-24, CC BY 4.0";
const RAW = "data/timing/raw/quran-align.zip";

type Row = { surah: number; ayah: number; segments: [number, number, number, number][] };

/** A segment is usable only if it points at real words and moves forward in time. */
export function validSegments(segments: number[][], wordCount: number) {
  return segments.filter(([a, b, s, e]) => a >= 0 && b > a && b <= wordCount && e > s);
}

async function main() {
  mkdirSync("data/timing/raw", { recursive: true });
  let zip: Buffer;
  try { zip = readFileSync(RAW); } catch {
    zip = Buffer.from(await (await fetch(URL)).arrayBuffer());
    writeFileSync(RAW, zip);
  }
  if (createHash("sha256").update(zip).digest("hex") !== SHA) throw new Error("timing archive checksum mismatch");
  const files = unzipSync(zip);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const ayahs = await db.quranAyah.findMany({ select: { surahId: true, ayahNumber: true, text: true } });
  const words = new Map(ayahs.map((a) => [`${a.surahId}:${a.ayahNumber}`, a.text.trim().split(/\s+/).length]));
  const report: Record<string, object> = {};
  for (const rec of await db.recitation.findMany()) {
    const folder = /\/data\/([^/]+)\//.exec(rec.urlTemplate)?.[1];
    const file = folder ? files[`${folder}.json`] : undefined;
    if (!file) { report[rec.slug] = { imported: 0, reason: "no timing file for this exact audio folder" }; continue; }
    const rows = JSON.parse(Buffer.from(file).toString("utf8")) as Row[];
    let partial = 0, skipped = 0;
    const data = [];
    for (const r of rows) {
      const count = words.get(`${r.surah}:${r.ayah}`);
      if (!count || !r.segments?.length) { skipped += 1; continue; }
      // Verified against the data: first-ayah indexes start at the ayah itself, with no Bismillah to skip.
      const moved = r.segments;
      const good = validSegments(moved, count);
      if (good.length !== moved.length) partial += 1;
      if (!good.length) { skipped += 1; continue; }
      data.push({ recitationId: rec.id, surahId: r.surah, ayahNumber: r.ayah, segments: good, source: SOURCE });
    }
    await db.ayahWordTiming.deleteMany({ where: { recitationId: rec.id } });
    for (let i = 0; i < data.length; i += 500) await db.ayahWordTiming.createMany({ data: data.slice(i, i + 500) });
    report[rec.slug] = { imported: data.length, skipped, partial };
  }
  console.log(JSON.stringify(report, null, 1));
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
