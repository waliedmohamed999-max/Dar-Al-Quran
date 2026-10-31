import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { pageCtx, type PageParams } from "@/lib/page";
import { listPrograms } from "@/modules/site/service";

export const metadata = { title: "البرامج التعليمية | Programs", description: "مسارات الحفظ والمراجعة والتلاوة والتجويد والتفسير." };

export default async function Programs({ params }: PageParams) {
  const { locale, t, lp } = await pageCtx(params);
  const programs = await listPrograms();
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageHeader title={t("البرامج التعليمية", "Programs")} subtitle={t("اختر المسار المناسب، أو اكتشف مستواك أولاً من الصفحة الرئيسية.", "Choose your track, or discover your level first on the home page.")} />
      {programs.length === 0 ? <Empty title={t("لم تنشر برامج بعد.", "No programs published yet.")} /> : (
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {programs.map((p, i) => <li key={p.id}><Link href={lp(`/programs/${p.slug}`)} className="card lift block h-full no-underline"><span className="text-sm font-bold text-gold">{String(i + 1).padStart(2, "0")}</span><h2 className="mt-1 text-xl text-brand">{locale === "ar" ? p.titleAr : p.titleEn}</h2><p className="mt-1 text-sm text-ink-2">{locale === "ar" ? p.summaryAr : p.summaryEn}</p></Link></li>)}
        </ul>
      )}
    </div>
  );
}
