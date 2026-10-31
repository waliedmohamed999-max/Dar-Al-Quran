import { notFound } from "next/navigation";
import { ProgressView } from "@/components/progress-view";
import { PageHeader } from "@/components/ui";
import { guard, pageCtx, type PageParams } from "@/lib/page";
import { studentProgress } from "@/modules/learning/service";

export const metadata = { title: "التقدم | Progress", robots: { index: false } };

export default async function ProgressPage({ params }: PageParams) {
  const { locale, t } = await pageCtx(params);
  const actor = await guard(locale);
  if (!actor.studentId) notFound();
  const p = await studentProgress(actor, actor.studentId);
  return (
    <>
      <PageHeader title={t("تقدمي", "My progress")} subtitle={t("تحسب الأرقام من السجلات الفعلية فقط.", "Figures come from actual records only.")} />
      <ProgressView p={p} locale={locale} />
    </>
  );
}
