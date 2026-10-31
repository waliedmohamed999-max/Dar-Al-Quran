// Compares Quran quoted inside adhkar with the stored mushaf and records the result. Never edits a dhikr.
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { buildQuoteIndex, findQuotes } from "../src/modules/adhkar/quotes";

async function main() {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const q = buildQuoteIndex(await db.quranAyah.findMany({ orderBy: { id: "asc" }, select: { surahId: true, ayahNumber: true, searchText: true } }));
  const list = await db.dhikr.findMany({ orderBy: { sortOrder: "asc" } });
  const rows: string[] = [];
  let withQuotes = 0;
  for (const d of list) {
    const m = findQuotes(d.text, q);
    await db.dhikr.update({ where: { id: d.id }, data: { quoteCheck: m, quoteCheckedAt: new Date() } });
    if (m.length) {
      withQuotes += 1;
      rows.push(`| ${d.externalRef ?? d.id} | ${d.titleAr} | ${m.map((x) => `${x.surahId}:${x.ayahNumber} (${x.words}/${x.ayahWords}${x.kind === "FULL_AYAH" ? "، آية كاملة" : ""})`).join("، ")} |`);
    }
  }
  if (process.argv.includes("--report")) {
    writeFileSync("docs/release/ADHKAR_QURAN_QUOTES.md", `# الآيات المقتبسة داخل الأذكار

فحص آلي استشاري لـ ${list.length} ذكراً، وجد خمس كلمات متتالية أو أكثر من القرآن في ${withQuotes} منها.

- **معنى التطابق:** نفس الحروف بنفس الترتيب بعد حذف التشكيل وحروف المد، لأن نص الأذكار بالرسم الإملائي والمصحف بالرسم العثماني. **هذا لا يثبت تطابق النص حرفياً**، ويلزم أن يقابل المختص كل موضع.
- **حدود الفحص:** لا يكتشف اقتباساً أقصر من خمس كلمات، ولا اقتباساً فيه خطأ يكسر التتابع. غياب نتيجة لا يعني غياب الاقتباس.
- لا يعدل الفحص أي نص. وتظهر نتيجته للمراجع في \`/admin/scholarly\`.

| الذكر | العنوان | الموضع (الكلمات المطابقة / كلمات الآية) |
|---|---|---|
${rows.join("\n")}
`);
  }
  console.log({ checked: list.length, withQuotes });
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
