// Downloads source data into data/quran/raw (git-ignored). Run once, then `quran:import`.
// Sources and licenses: docs/DATA_LICENSES.md
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const RAW = "data/quran/raw";
const EDITIONS = ["quran-uthmani", "quran-tajweed"];

async function main() {
  await mkdir(RAW, { recursive: true });
  for (const edition of EDITIONS) {
    const url = `https://api.alquran.cloud/v1/quran/${edition}`;
    console.log("GET", url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    await writeFile(join(RAW, `${edition}.json`), await res.text());
  }
  // Used to cross-check the Tanzil text against an independent source, not stored in the DB.
  const url = "https://api.quran.com/api/v4/quran/verses/uthmani";
  console.log("GET", url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  await writeFile(join(RAW, "crosscheck-uthmani.json"), await res.text());
  const meta = await fetch("https://api.quran.com/api/v4/chapters?language=ar");
  await writeFile(join(RAW, "chapters.json"), await meta.text());
  console.log("done");
}
main().catch((e) => { console.error(e); process.exit(1); });
