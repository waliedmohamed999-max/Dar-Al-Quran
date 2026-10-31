import Link from "next/link";
import { Empty, Notice, PageHeader } from "@/components/ui";
import { pageCtx, type PageParams, type SearchProps } from "@/lib/page";
import { searchAyahs } from "@/modules/quran/service";

export const metadata = { title: "البحث في المصحف | Search", robots: { index: false } };

export default async function SearchPage({ params, searchParams }: PageParams & SearchProps) {
  const { locale, t, lp } = await pageCtx(params);
  const q = ((await searchParams).q ?? "").trim();
  const result = q.length >= 2 ? await searchAyahs(q) : null;
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <PageHeader title={t("البحث في المصحف", "Search the mushaf")} />
      <form role="search" className="mb-5 flex gap-2">
        <label htmlFor="q" className="sr-only">{t("كلمة البحث", "Search term")}</label>
        <input id="q" name="q" defaultValue={q} className="input" lang="ar" minLength={2} required />
        <button className="btn btn-primary">{t("بحث", "Search")}</button>
      </form>
      {!result && <Notice>{t("اكتب حرفين على الأقل. لا يلزم كتابة التشكيل.", "Type at least two letters. Diacritics are not needed.")}</Notice>}
      {result && result.rows.length === 0 && <Empty title={t("لا توجد نتائج مطابقة.", "No matching results.")} hint={t("جرب كلمة أقصر أو دون أل التعريف.", "Try a shorter word.")} />}
      {result && result.rows.length > 0 && (
        <>
          <p className="mb-3 text-sm text-ink-2" role="status">{t(`عدد الآيات: ${result.total}`, `Ayahs found: ${result.total}`)}{result.total > result.rows.length ? t(` (تعرض أول ${result.rows.length})`, ` (showing first ${result.rows.length})`) : ""}</p>
          <ul className="space-y-3">
            {result.rows.map((a) => (
              <li key={a.id} className="card">
                <p className="quran" lang="ar" dir="rtl" style={{ "--quran-size": "1.4rem" } as React.CSSProperties}>{a.text}</p>
                <Link className="text-sm underline" href={lp(`/mushaf/surah/${a.surahId}?ayah=${a.ayahNumber}`)}>{locale === "ar" ? a.surah.nameArabic : a.surah.nameEnglish} : {a.ayahNumber}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
