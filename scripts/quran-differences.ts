// Writes the human-review document for ayahs where the two text sources differ. Quotes both verbatim. Changes nothing.
import { readFileSync, writeFileSync } from "node:fs";
import { separateBismillah, skeleton } from "../src/modules/quran/text";

const raw = (f: string) => JSON.parse(readFileSync(`data/quran/raw/${f}`, "utf8"));
const main = raw("quran-uthmani.json") as { data: { surahs: { number: number; ayahs: { numberInSurah: number; text: string }[] }[] } };
const cross = new Map<string, string>((raw("crosscheck-uthmani.json").verses as { verse_key: string; text_uthmani: string }[]).map((v) => [v.verse_key, v.text_uthmani]));

const out: string[] = [];
let n = 0, total = 0;
for (const s of main.data.surahs) for (const a of s.ayahs) {
  total += 1;
  const key = `${s.number}:${a.numberInSurah}`;
  const stored = separateBismillah(s.number, a.numberInSurah, a.text);
  const other = cross.get(key) ?? "";
  if (skeleton(stored) === skeleton(other)) continue;
  n += 1;
  const w1 = stored.split(/\s+/), w2 = other.split(/\s+/);
  const words: string[] = [];
  for (let i = 0; i < Math.max(w1.length, w2.length); i++) if (skeleton(w1[i] ?? "") !== skeleton(w2[i] ?? "")) words.push(`الكلمة ${i + 1}: «${w1[i] ?? "—"}» مقابل «${w2[i] ?? "—"}»`);
  out.push(`## ${key}\n\n- **المخزن في المنصة (Tanzil):** ${stored}\n- **المصدر المستقل (Quran.com uthmani):** ${other}\n- **مواضع الاختلاف في الهيكل:** ${words.slice(0, 6).join("؛ ") || "—"}\n- **قرار المراجع:** ............ **الاسم والتاريخ:** ............\n`);
}
writeFileSync("docs/release/QURAN_TEXT_DIFFERENCES.md", `# فروق النص القرآني بانتظار مراجعة مختص

مقارنة آلية لهيكل الحروف، بعد حذف التشكيل، بين المصدرين لكل الآيات (${total}). وجدت ${n} مواضع. قد يكون الفرق في طريقة الكتابة بين المصدرين لا في القراءة، **والفصل فيه للمختص بالرسم والضبط لا للنظام**.

- لم يعدل أي نص آلياً، والمنصة تعرض نص Tanzil كما هو، ويفشل \`npm run quran:verify\` عند أي تغيير.
- لا تدل هذه القائمة على سلامة بقية الآيات من حيث التشكيل: المقارنة على الحروف فقط.
- المطلوب: مقابلة كل موضع بالمصحف المطبوع المعتمد، ثم تسجيل القرار هنا.

${out.join("\n")}`);
console.log({ total, differences: n });
