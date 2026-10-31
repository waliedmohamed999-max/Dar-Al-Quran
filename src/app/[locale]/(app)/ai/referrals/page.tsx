import { notFound } from "next/navigation";
import { ActionForm } from "@/components/client";
import { Empty, PageHeader, Section } from "@/components/ui";
import { withActor } from "@/lib/db";
import { fmtDateTime } from "@/lib/i18n";
import { guard, pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "الأسئلة المحالة | Referrals", robots: { index: false } };

export default async function Referrals({ params }: PageParams) {
  const { locale, t } = await pageCtx(params);
  const actor = await guard(locale);
  if (!actor.teacherId && !actor.perms.has("ai.manage")) notFound();
  const list = await withActor(actor, (tx) => tx.aiInteraction.findMany({ where: { status: "REFERRED", userId: { not: actor.id } }, orderBy: { createdAt: "asc" }, take: 50 }));
  return (
    <>
      <PageHeader title={t("الأسئلة المحالة من المساعد", "Questions referred by the assistant")} />
      <Section title={t("بانتظار الرد", "Awaiting a reply")}>
        {list.length === 0 ? <Empty title={t("لا توجد أسئلة محالة.", "No referred questions.")} /> : (
          <ul className="space-y-4">{list.map((q) => (
            <li key={q.id} className="border-b border-line pb-4">
              <p className="font-semibold">{q.question}</p>
              <p className="mb-2 text-xs text-ink-2">{fmtDateTime(locale, q.createdAt)}</p>
              <ActionForm path={`/ai/referrals/${q.id}/resolve`} submit={t("إرسال الرد", "Send reply")} fields={[{ name: "reply", label: t("ردك", "Your reply"), type: "textarea", required: true }]} />
            </li>
          ))}</ul>
        )}
      </Section>
    </>
  );
}
