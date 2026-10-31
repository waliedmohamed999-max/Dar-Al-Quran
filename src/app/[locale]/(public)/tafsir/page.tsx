import Link from "next/link";
import { Empty, Notice, PageHeader, Section } from "@/components/ui";
import { pageCtx, type PageParams, type SearchProps } from "@/lib/page";
import { systemDb } from "@/lib/db";
import { approvedTafsirSources, listSurahs, tafsirFor } from "@/modules/quran/service";

export const metadata = { title: "التفسير | Tafsir", description: "تفسير الآيات من مصادر مذكورة بأسمائها، مع مقارنة بين التفاسير." };

export default async function TafsirPage({ params, searchParams }: PageParams & SearchProps) {
  const { locale, t, lp } = await pageCtx(params);
  const sp = await searchParams;
  const [surahs, sources] = await Promise.all([listSurahs(), approvedTafsirSources()]);
  const surahId = Math.min(114, Math.max(1, Number(sp.surah) || 1));
  const surah = surahs.find((s) => s.id === surahId)!;
  const ayahNumber = Math.min(surah.ayahCount, Math.max(1, Number(sp.ayah) || 1));
  const ayah = await systemDb().quranAyah.findFirstOrThrow({ where: { surahId, ayahNumber } });
  const results = await Promise.all(sources.map((s) => tafsirFor(ayah.id, s.slug)));

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <PageHeader title={t("التفسير", "Tafsir")} subtitle={t("لا تولد المنصة أي تفسير. يعرض النص من المصدر المذكور بعد اعتماد المصدر علمياً.", "The platform never generates tafsir. Text is shown from the named source after the source passes scholarly review.")} />
      {sources.some((s) => s.reviewedBy === "demo-seed") && <Notice tone="warn">{t("نسخة تجريبية: اعتماد المصادر هنا تجريبي ويلزم اعتمادها من مختص قبل الإطلاق.", "Demo: source approval here is for demonstration and needs a specialist before launch.")}</Notice>}
      <Notice>{t("معاني المفردات وأسباب النزول غير متاحة حالياً لعدم توفر مصدر محقق مرخص لها.", "Word meanings and occasions of revelation are unavailable until a verified, licensed source is configured.")}</Notice>
      <p className="mb-5"><Link className="btn btn-primary" href={lp(`/tafsir/surah/${surahId}`)}>{t("دراسة السورة كاملة", "Study the whole surah")}</Link></p>
      <form className="card mb-6 grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
        <div>
          <label htmlFor="surah" className="label">{t("السورة", "Surah")}</label>
          <select id="surah" name="surah" className="input" defaultValue={surahId}>
            {surahs.map((s) => <option key={s.id} value={s.id}>{s.id}. {locale === "ar" ? s.nameArabic : s.nameEnglish}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="ayah" className="label">{t("الآية", "Ayah")}</label>
          <input id="ayah" name="ayah" type="number" min={1} defaultValue={ayahNumber} className="input" />
        </div>
        <button className="btn btn-primary">{t("عرض", "Show")}</button>
      </form>

      <Section title={`${locale === "ar" ? surah.nameArabic : surah.nameEnglish} : ${ayahNumber}`} actions={<Link className="text-sm underline" href={lp(`/mushaf/surah/${surahId}?ayah=${ayahNumber}`)}>{t("فتح في المصحف", "Open in mushaf")}</Link>}>
        <p className="quran" lang="ar" dir="rtl">{ayah.text}</p>
      </Section>

      {sources.length === 0 ? <Empty title={t("لم يعتمد أي مصدر تفسير بعد.", "No tafsir source has been approved yet.")} /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {results.map((r) => (
            <section key={r.source.slug} className="card">
              <h2 className="text-lg text-brand">{locale === "ar" ? r.source.nameAr : r.source.nameEn}</h2>
              <p className="text-xs text-ink-2">{r.source.author}</p>
              <div className="mt-2 max-h-96 overflow-y-auto text-sm leading-7" lang="ar" dir="rtl" tabIndex={0}>
                {r.text ?? <span className="text-ink-2">{t("تعذر الجلب من المصدر أو غير متاح لهذه الآية.", "Could not fetch from the source, or unavailable for this ayah.")}</span>}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
