import { notFound, redirect } from "next/navigation";
import { AssessmentForm } from "@/components/assessment-form";
import { PageHeader } from "@/components/ui";
import { guard, pageCtx, type PageParams } from "@/lib/page";
import { assessmentForStudent } from "@/modules/assessments/service";

export const metadata = { title: "اختبار | Assessment", robots: { index: false } };

export default async function TakeAssessment({ params }: PageParams<{ id: string }>) {
  const { locale, lp } = await pageCtx(params);
  const actor = await guard(locale);
  if (!actor.studentId) notFound();
  const a = await assessmentForStudent(actor, (await params).id);
  if (a.attempt && a.attempt.status !== "IN_PROGRESS") redirect(lp("/student/assessments"));
  return (
    <>
      <PageHeader title={a.title} />
      <AssessmentForm id={a.id} backHref={lp("/student/assessments")} questions={a.items.map((i) => i.question as never)} />
    </>
  );
}
