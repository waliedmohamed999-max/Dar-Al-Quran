import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { pageCtx, type PageParams, type SearchProps } from "@/lib/page";
import { publicSearch } from "@/modules/site/service";

export const metadata = { title: "البحث | Search", robots: { index: false } };

export default async function SearchPage({ params, searchParams }: PageParams & SearchProps) {
  const { locale, t, lp } = await pageCtx(params);
  const q = ((await searchParams).q ?? "").trim();
  const r = q.length >= 2 ? await publicSearch(q, locale) : null;
  const links: { href: string; title: string; kind: string }[] = r ? [
    ...r.programs.map((p) => ({ href: `/programs/${p.slug}`, title: locale === "ar" ? p.titleAr : p.titleEn, kind: t("برنامج", "Program") })),
    ...r.rules.map((x) => ({ href: `/tajweed/${x.slug}`, title: locale === "ar" ? x.titleAr : x.titleEn, kind: t("درس تجويد", "Tajweed lesson") })),
    ...r.surahs.map((s) => ({ href: `/mushaf/surah/${s.id}`, title: locale === "ar" ? s.nameArabic : s.nameEnglish, kind: t("سورة", "Surah") })),
    ...r.content.map((c) => ({ href: c.type === "LIBRARY" ? `/library/${c.slug}` : c.type === "FAQ" ? "/#faq" : `/articles/${c.slug}`, title: c.title, kind: c.type === "LIBRARY" ? t("مكتبة", "Library") : t("منشور", "Post") })),
  ] : [];
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader title={t("البحث في الموقع", "Search the site")} />
      <form role="search" className="mb-5 flex gap-2"><label htmlFor="q" className="sr-only">{t("كلمة البحث", "Search term")}</label><input id="q" name="q" defaultValue={q} className="input" minLength={2} required /><button className="btn btn-primary">{t("بحث", "Search")}</button></form>
      {r && links.length === 0 && r.ayahs.length === 0 && <Empty title={t("لا توجد نتائج.", "No results.")} />}
      {links.length > 0 && <ul className="mb-5 space-y-2">{links.map((l) => <li key={l.href + l.title} className="card flex items-center justify-between gap-2 p-3"><Link className="underline" href={lp(l.href)}>{l.title}</Link><span className="text-xs text-ink-2">{l.kind}</span></li>)}</ul>}
      {r && r.ayahs.length > 0 && <><h2 className="mb-2 text-xl text-brand">{t("من المصحف", "From the mushaf")}</h2><ul className="space-y-2">{r.ayahs.map((a) => <li key={a.id} className="card p-3"><p className="quran" lang="ar" dir="rtl" style={{ "--quran-size": "1.3rem" } as React.CSSProperties}>{a.text}</p><Link className="text-sm underline" href={lp(`/mushaf/surah/${a.surahId}?ayah=${a.ayahNumber}`)}><bdi>{a.surahId}:{a.ayahNumber}</bdi></Link></li>)}</ul></>}
    </div>
  );
}
