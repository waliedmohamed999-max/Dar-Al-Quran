import { redirect } from "next/navigation";
import { ExamRunner } from "@/components/v3";
import { PageHeader } from "@/components/ui";
import { guard, pageCtx, type PageParams } from "@/lib/page";
import { examView } from "@/modules/unified/service";

export const metadata = { title: "اختبار | Exam", robots: { index: false } };

export default async function Exam({ params }: PageParams<{ id: string }>) {
  const { locale, t, lp } = await pageCtx(params);
  const actor = await guard(locale);
  const id = (await params).id;
  const v = await examView(actor, id).catch(() => null);
  if (!v) redirect(lp("/competitions"));
  if (v.status !== "IN_PROGRESS") redirect(lp(`/exams/${id}/result`));
  return (
    <>
      <PageHeader title={t("الاختبار", "Exam")} subtitle={t("تحفظ إجاباتك تلقائياً، ويمكنك الاستئناف ضمن الوقت.", "Answers save automatically, and you can resume within the time.")} />
      <ExamRunner attemptId={id} questions={v.questions as never} answers={v.answers} expiresAt={v.expiresAt?.toISOString() ?? null} backHref={lp(`/exams/${id}/result`)} />
    </>
  );
}
