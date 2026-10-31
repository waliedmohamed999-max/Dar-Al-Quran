import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { systemDb } from "@/lib/db";
import { pageCtx, type PageParams } from "@/lib/page";
import { approved } from "@/lib/scholarly";

export const metadata = { title: "أكاديمية الحديث الشريف | Hadith academy", description: "مسارات لحفظ الحديث الشريف وفهمه وتسميعه على المعلم." };

export default async function HadithHome({ params }: PageParams) {
  const { locale, t, lp } = await pageCtx(params);
  const list = await systemDb().hadithCollection.findMany({ where: { published: true, entries: { some: approved() } }, include: { _count: { select: { entries: { where: { ...approved() } } } } } });
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <PageHeader title={t("أكاديمية الحديث الشريف", "Hadith academy")} subtitle={t("حفظ وفهم وتسميع بإشراف المعلم. تضاف المسارات بعد توثيق مصادرها.", "Memorize, understand and recite under a teacher. Tracks are added once their sources are documented.")} />
      {list.length === 0 ? <Empty title={t("لم ينشر أي مسار بعد.", "No track has been published yet.")} hint={t("ينشر المسار بعد مقابلة نصوصه بنسخة محققة.", "A track is published after its texts are checked against a verified edition.")} /> : (
        <ul className="grid gap-4 md:grid-cols-2">{list.map((c) => <li key={c.id}><Link href={lp(`/hadith/${c.slug}`)} className="card lift block h-full no-underline"><h2 className="text-xl text-brand">{locale === "ar" ? c.titleAr : c.titleEn}</h2><p className="mt-1 text-sm text-ink-2">{c.descriptionAr}</p><p className="mt-2 text-xs text-gold">{t(`${c._count.entries} حديثاً معتمداً`, `${c._count.entries} approved hadiths`)}</p></Link></li>)}</ul>
      )}
    </div>
  );
}
