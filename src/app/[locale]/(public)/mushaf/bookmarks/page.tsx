import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { guard, pageCtx, type PageParams } from "@/lib/page";
import { myQuranState } from "@/modules/quran/service";

export const metadata = { title: "المفضلة | Favourites", robots: { index: false } };

export default async function Bookmarks({ params }: PageParams) {
  const { locale, t, lp } = await pageCtx(params);
  const actor = await guard(locale);
  const { bookmarks } = await myQuranState(actor);
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <PageHeader title={t("المفضلة والعلامات المرجعية", "Favourites and bookmarks")} />
      {bookmarks.length === 0 ? <Empty title={t("لم تحفظ آيات بعد.", "No saved ayahs yet.")} hint={t("افتح آية في المصحف واضغط على القلب أو العلامة.", "Open an ayah in the mushaf and tap the heart or bookmark.")} /> : (
        <ul className="space-y-3">
          {bookmarks.map((b) => (
            <li key={b.id} className="card">
              <p className="quran" lang="ar" dir="rtl" style={{ "--quran-size": "1.4rem" } as React.CSSProperties}>{b.ayah.text}</p>
              <Link className="text-sm underline" href={lp(`/mushaf/surah/${b.ayah.surahId}?ayah=${b.ayah.ayahNumber}`)}>{locale === "ar" ? b.ayah.surah.nameArabic : b.ayah.surah.nameEnglish} : {b.ayah.ayahNumber}</Link>
              <span className="ms-2 text-xs text-ink-2">{b.kind === "FAVORITE" ? t("مفضلة", "Favourite") : t("علامة", "Bookmark")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
