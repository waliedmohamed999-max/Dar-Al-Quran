// Downloads adhkar and hadith sources into data/content/raw (git-ignored). Then run content:import.
// Rights and review status for each source: docs/DATA_LICENSES.md
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const RAW = "data/content/raw";

async function get(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return (await res.text()).replace(/^﻿/, "");
}

async function main() {
  await mkdir(RAW, { recursive: true });
  await writeFile(join(RAW, "nawawi.json"), await get("https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/ara-nawawi.json"));
  const index = JSON.parse(await get("https://hisnmuslim.com/api/ar/husn_ar.json"));
  const chapters = index[Object.keys(index)[0]] as { ID: number; TITLE: string; TEXT: string }[];
  const out = [];
  for (const c of chapters) {
    const body = JSON.parse(await get(c.TEXT.replace("http://", "https://")));
    out.push({ id: c.ID, title: c.TITLE, items: body[Object.keys(body)[0]] });
  }
  await writeFile(join(RAW, "hisn.json"), JSON.stringify(out));
  console.log(`hisn chapters: ${out.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
