import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { pageCtx, type PageParams, type SearchProps } from "@/lib/page";
import { getActor } from "@/lib/session";
import { juzIndex, listSurahs, myQuranState } from "@/modules/quran/service";

export const metadata = { title: "المصحف المعلم | Teaching Mushaf", description: "القرآن الكريم كاملاً بالرسم العثماني مع تلاوة لكل آية." };

export default async function MushafIndex({ params, searchParams }: PageParams & SearchProps) {
  const { locale, t, lp } = await pageCtx(params);
  const q = (await searchParams).q;
  if (q) redirect(lp(`/mushaf/search?q=${encodeURIComponent(q)}`));
  const [surahs, juz, actor] = await Promise.all([listSurahs(), juzIndex(), getActor()]);
  const state = actor ? await myQuranState(actor) : null;
  const pos = state?.position?.ayah;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageHeader title={t("المصحف المعلم", "Teaching Mushaf")} subtitle={t("114 سورة، 30 جزءاً، 604 صفحات. رواية حفص عن عاصم، الرسم العثماني.", "114 surahs, 30 juz, 604 pages. Hafs from Asim, Uthmani script.")} />
      <form action={lp("/mushaf/search")} role="search" className="mb-5 flex gap-2">
        <label htmlFor="q" className="sr-only">{t("بحث في المصحف", "Search the mushaf")}</label>
        <input id="q" name="q" className="input" placeholder={t("ابحث عن كلمة في القرآن", "Search for a word (Arabic)")} lang="ar" minLength={2} required />
        <button className="btn btn-primary">{t("بحث", "Search")}</button>
      </form>
      <div className="mb-6 flex flex-wrap gap-2">
        {pos && <Link className="btn btn-primary" href={lp(`/mushaf/surah/${pos.surahId}?ayah=${pos.ayahNumber}`)}>{t("متابعة من آخر موضع", "Continue where you stopped")} ({pos.surahId}:{pos.ayahNumber})</Link>}
        <Link className="btn btn-ghost" href={lp("/mushaf/page/1")}>{t("عرض الصفحات", "Page view")}</Link>
        {actor && <Link className="btn btn-ghost" href={lp("/mushaf/bookmarks")}>{t("المفضلة والعلامات", "Favourites and bookmarks")}</Link>}
      </div>

      <form action={lp("/mushaf/go")} className="card mb-6 flex flex-wrap items-end gap-2">
        <div><label htmlFor="go-s" className="label">{t("انتقل إلى سورة", "Go to surah")}</label><input id="go-s" name="surah" type="number" min={1} max={114} required className="input w-28" /></div>
        <div><label htmlFor="go-a" className="label">{t("آية", "Ayah")}</label><input id="go-a" name="ayah" type="number" min={1} defaultValue={1} className="input w-24" /></div>
        <button className="btn btn-ghost">{t("انتقال", "Go")}</button>
      </form>
      <h2 className="mb-3 text-2xl text-brand">{t("فهرس السور", "Surah index")}</h2>
      <ul className="mb-10 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {surahs.map((s) => (
          <li key={s.id}>
            <Link href={lp(`/mushaf/surah/${s.id}`)} className="card flex items-center gap-3 p-3 no-underline hover:border-gold">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-gold text-sm text-gold">{s.id}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{locale === "ar" ? s.nameArabic : s.nameEnglish}</span>
                <span className="block text-xs text-ink-2">{s.revelationPlace === "MAKKAH" ? t("مكية", "Makkan") : t("مدنية", "Madinan")} · {s.ayahCount} {t("آية", "ayahs")}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="mb-3 text-2xl text-brand">{t("الأجزاء", "Juz")}</h2>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-10">
        {juz.map((j) => <li key={j.juz}><Link className="btn btn-ghost w-full" href={lp(`/mushaf/juz/${j.juz}`)}>{j.juz}</Link></li>)}
      </ul>
      <h2 className="mb-3 mt-10 text-2xl text-brand">{t("الأحزاب", "Hizb")}</h2>
      <ul className="grid grid-cols-5 gap-2 sm:grid-cols-10 lg:grid-cols-15">
        {Array.from({ length: 60 }, (_, i) => i + 1).map((h) => <li key={h}><Link className="btn btn-ghost btn-sm w-full" href={lp(`/mushaf/hizb/${h}`)}>{h}</Link></li>)}
      </ul>
    </div>
  );
}
