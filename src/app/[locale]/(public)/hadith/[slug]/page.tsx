import Link from "next/link";
import { notFound } from "next/navigation";
import { Empty, Notice, PageHeader, Section } from "@/components/ui";
import { systemDb } from "@/lib/db";
import { pageCtx, type PageParams } from "@/lib/page";
import { approved } from "@/lib/scholarly";

export default async function Collection({ params }: PageParams<{ slug: string }>) {
  const { locale, t, lp } = await pageCtx(params);
  const c = await systemDb().hadithCollection.findFirst({ where: { slug: (await params).slug, published: true }, include: { entries: { where: { ...approved() }, orderBy: { number: "asc" } } } });
  if (!c || c.entries.length === 0) notFound();
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <PageHeader title={locale === "ar" ? c.titleAr : c.titleEn} subtitle={c.descriptionAr} />
      {c.entries.some((e) => e.reviewedBy === "demo-seed") && <Notice tone="warn">{t("نسخة تجريبية: لم يقابل مشرف علمي هذه النصوص بنسخة محققة بعد.", "Demo: a scholarly supervisor has not yet checked these texts against a verified edition.")}</Notice>}
      <Notice>{t(`المصدر: ${c.sourceName}. ${c.licenseNote}`, `Source: ${c.sourceName}. ${c.licenseNote}`)}</Notice>
      <Section title={t("الأحاديث", "Hadiths")}>
        {c.entries.length === 0 ? <Empty title={t("لا توجد أحاديث معتمدة بعد.", "No approved hadiths yet.")} /> : <ol className="space-y-2">{c.entries.map((e) => <li key={e.id}><Link href={lp(`/hadith/${c.slug}/${e.number}`)} className="block rounded-lg border border-line p-3 no-underline hover:border-gold"><span className="font-bold text-gold">{e.number}. </span><span lang="ar">{e.text.slice(0, 110)}…</span></Link></li>)}</ol>}
      </Section>
    </div>
  );
}
