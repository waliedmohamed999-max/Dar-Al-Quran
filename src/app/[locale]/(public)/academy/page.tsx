import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "الأكاديمية | Academy", description: "كيف تعمل أكاديمية دار القرآن: الخطط والفصول والتسميع والمتابعة." };

export default async function Academy({ params }: PageParams) {
  const { t, lp } = await pageCtx(params);
  const items = [
    [t("الفصول المباشرة", "Live classes"), t("حصص أونلاين لأعضاء الحلقة مع مصحف مشترك وحضور وواجبات.", "Online sessions for halaqa members with a shared mushaf, attendance and follow-up work."), "/register"],
    [t("البرنامج اليومي", "Daily program"), t("حفظ ومراجعة واستماع وتجويد وتفسير، يعتمده المعلم.", "Memorization, revision, listening, tajweed and tafsir, approved by the teacher."), "/register"],
    [t("التسميع والتقييم", "Recitation and assessment"), t("تسجيل في المتصفح وتقييم بشري بمعايير واضحة.", "Browser recording and human assessment against clear criteria."), "/register"],
    [t("البرامج", "Programs"), t("مسارات تناسب كل مستوى وعمر.", "Tracks for every level and age."), "/programs"],
    [t("المصحف المعلم", "Teaching mushaf"), t("جربه الآن دون تسجيل.", "Try it now without registering."), "/mushaf"],
    [t("التحقق من شهادة", "Verify a certificate"), t("تحقق عام بمعرف الشهادة.", "Public check by certificate ID."), "/verify"],
  ];
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <PageHeader title={t("الأكاديمية", "The academy")} subtitle={t("بيئة تعلم يقودها المعلم وتدعمها التقنية.", "A teacher-led environment supported by technology.")} />
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{items.map(([a, b, h]) => <li key={a}><Link href={lp(h)} className="card lift block h-full no-underline"><h2 className="text-xl text-brand">{a}</h2><p className="mt-1 text-sm text-ink-2">{b}</p></Link></li>)}</ul>
    </div>
  );
}
