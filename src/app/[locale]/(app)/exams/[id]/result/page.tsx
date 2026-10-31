import { notFound } from "next/navigation";
import { ActionForm } from "@/components/client";
import { PageHeader, Section, StatusBadge } from "@/components/ui";
import { guard, pageCtx, type PageParams } from "@/lib/page";
import { withActor } from "@/lib/db";
import { examFeedback } from "@/modules/unified/service";

export const metadata = { title: "النتيجة | Result", robots: { index: false } };

export default async function Result({ params }: PageParams<{ id: string }>) {
  const { locale, t } = await pageCtx(params);
  const actor = await guard(locale);
  const id = (await params).id;
  const f = await examFeedback(actor, id).catch(() => null);
  if (!f) notFound();
  const appeals = await withActor(actor, (tx) => tx.examAppeal.findMany({ where: { attemptId: id }, orderBy: { createdAt: "desc" } }));
  return (
    <>
      <PageHeader title={t("نتيجة الاختبار", "Exam result")} />
      <Section title={t("النتيجة", "Result")} actions={<StatusBadge locale={locale} status={f.status} />}>
        {f.scorePercent != null ? <p className="text-3xl font-bold text-brand">{f.scorePercent}%</p> : <p className="text-ink-2">{t("بانتظار تصحيح المعلم للأسئلة العملية.", "Waiting for the teacher to grade practical questions.")}</p>}
      </Section>
      <Section title={t("مهارات تحتاج إلى مراجعة", "Skills to review")}>
        {Object.keys(f.missed).length === 0 ? <p className="text-sm text-ink-2">{t("لا توجد مواضع مسجلة.", "Nothing recorded.")}</p> : <ul className="flex flex-wrap gap-2">{Object.entries(f.missed).map(([k, n]) => <li key={k} className="rounded-full border border-line px-3 py-1 text-sm" dir="ltr">{k} ({n})</li>)}</ul>}
      </Section>
      <Section title={t("الاعتراض ومراجعة النتيجة", "Appeal and review")}>
        {appeals.map((a) => <p key={a.id} className="mb-2 rounded bg-surface-2 p-2 text-sm"><StatusBadge locale={locale} status={a.status} /> {a.reason}{a.decision && <><br /><strong>{t("القرار", "Decision")}:</strong> {a.decision}</>}</p>)}
        {actor.studentId && <ActionForm path={`/exams/${id}/appeal`} submit={t("إرسال الاعتراض", "Send appeal")} fields={[{ name: "reason", label: t("سبب الاعتراض", "Reason"), type: "textarea", required: true }]} />}
      </Section>
    </>
  );
}
