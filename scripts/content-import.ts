// Imports fetched adhkar and hadith verbatim, always PENDING, so nothing publishes without review.
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { sha256 } from "../src/modules/quran/text";

const read = (f: string) => JSON.parse(readFileSync(`data/content/raw/${f}`, "utf8"));
const HISN_NOTE = "حصن المسلم عبر hisnmuslim.com. لم يذكر الموقع ترخيصاً؛ يلزم تأكيد الحق. آيات القرآن داخل الأذكار ليست من النص المعتمد في المصحف.";

function category(title: string) {
  if (title.includes("الصباح والمساء")) return "MORNING_EVENING";
  if (title.includes("الاستيقاظ")) return "WAKING";
  if (title.includes("النوم")) return "SLEEP";
  if (title.includes("بعد السلام من الصلاة")) return "AFTER_PRAYER";
  if (/الطعام|الأكل|الشراب|الضيف/.test(title)) return "FOOD";
  if (/السفر|المسافر|الركوب|الدابة/.test(title)) return "TRAVEL";
  if (/دخول|الخروج|عند الخروج/.test(title)) return "ENTRY_EXIT";
  return "GENERAL";
}

async function main() {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const nawawi = read("nawawi.json");
  const col = await db.hadithCollection.upsert({
    where: { slug: "nawawi-40" }, update: {},
    create: {
      slug: "nawawi-40", titleAr: "الأربعون النووية", titleEn: "An-Nawawi's Forty", level: 1,
      descriptionAr: "مسار لحفظ أحاديث الأربعين النووية وفهمها: تدريب متدرج، ثم تسميع على المعلم، ثم مراجعة لاحقة، ثم اختبار نهائي وشهادة إتمام بعد الاعتماد.",
      sourceName: "fawazahmed0/hadith-api, ara-nawawi", licenseNote: "المستودع مرخص Unlicense. يلزم أن يقابل المشرف العلمي النص بنسخة محققة قبل النشر.",
    },
  });
  const hadiths = nawawi.hadiths as { hadithnumber: number; text: string; grades?: { name: string; grade: string }[] }[];
  for (const h of hadiths) {
    const g = h.grades?.[0];
    await db.hadithEntry.upsert({
      where: { collectionId_number: { collectionId: col.id, number: h.hadithnumber } }, update: {},
      create: { collectionId: col.id, number: h.hadithnumber, text: h.text.trim(), sha256: sha256(h.text.trim()), sourceRef: `الأربعون النووية، رقم ${h.hadithnumber}`, grade: g?.grade ?? null, gradeSource: g?.name ?? null },
    });
  }
  const hisn = read("hisn.json") as { id: number; title: string; items: { ID: number; ARABIC_TEXT: string; REPEAT: number }[] }[];
  let order = 0, dhikrs = 0;
  for (const c of hisn) for (const it of c.items) {
    const text = it.ARABIC_TEXT?.trim();
    if (!text) continue;
    await db.dhikr.upsert({
      where: { externalRef: `hisn:${it.ID}` }, update: {},
      create: { externalRef: `hisn:${it.ID}`, category: category(c.title) as never, titleAr: c.title, text, repeat: it.REPEAT > 1 ? it.REPEAT : null, sourceName: "حصن المسلم", licenseNote: HISN_NOTE, sortOrder: order++ },
    });
    dhikrs += 1;
  }
  writeFileSync("data/content-manifest.json", JSON.stringify({
    hadith: { source: "fawazahmed0/hadith-api ara-nawawi", count: hadiths.length, allSha256: sha256(hadiths.map((h) => h.text.trim()).join("\n")), withGrade: hadiths.filter((h) => h.grades?.length).length },
    adhkar: { source: "hisnmuslim.com husn_ar", chapters: hisn.length, count: dhikrs },
  }, null, 2) + "\n");
  console.log({ hadiths: hadiths.length, dhikrs });
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
