import Link from "next/link";
import { AskAssistant } from "@/components/academy";
import { Empty, Notice, PageHeader, Section, StatusBadge } from "@/components/ui";
import { withActor } from "@/lib/db";
import { fmtDateTime } from "@/lib/i18n";
import { guard, pageCtx, type PageParams } from "@/lib/page";
import { aiStatus } from "@/modules/ai/service";

export const metadata = { title: "المعلم الذكي | AI teacher", robots: { index: false } };

export default async function AiPage({ params }: PageParams) {
  const { locale, t, lp } = await pageCtx(params);
  const actor = await guard(locale);
  const [status, history] = await Promise.all([aiStatus(), withActor(actor, (tx) => tx.aiInteraction.findMany({ where: { userId: actor.id }, orderBy: { createdAt: "desc" }, take: 20 }))]);
  return (
    <>
      <PageHeader title={t("المعلم الذكي", "AI Quran teacher")} subtitle={t("يجيب من المصادر المراجعة فقط، ويذكر مراجعه، ويحيل غير المحسوم إلى المعلم. لا يصدر فتاوى.", "Answers only from reviewed sources, lists its references, and refers unsettled questions to a teacher. It issues no rulings.")} actions={actor.teacherId || actor.perms.has("ai.manage") ? <Link className="btn btn-ghost" href={lp("/ai/referrals")}>{t("الأسئلة المحالة", "Referred questions")}</Link> : undefined} />
      {!status.enabled ? <Notice tone="warn">{t("المساعد غير مفعل حالياً. تفعله الإدارة من لوحتها.", "The assistant is not enabled. The administration can enable it.")}</Notice> : (
        <>
          {!status.providerConfigured && <Notice>{t("نموذج الذكاء الاصطناعي غير مهيأ، لذا يعرض المساعد المصادر المطابقة فقط.", "No AI model is configured, so the assistant shows matching sources only.")}</Notice>}
          <Section title={t("اسأل", "Ask")}><AskAssistant /></Section>
        </>
      )}
      <Section title={t("أسئلتك السابقة", "Your previous questions")}>
        {history.length === 0 ? <Empty title={t("لا توجد أسئلة بعد.", "No questions yet.")} /> : (
          <ul className="space-y-3">{history.map((h) => (
            <li key={h.id} className="rounded-xl border border-line p-3">
              <p className="font-semibold">{h.question}</p>
              <p className="text-xs text-ink-2">{fmtDateTime(locale, h.createdAt)}</p>
              {h.answer && <p className="mt-1 whitespace-pre-wrap text-sm">{h.answer}</p>}
              {h.teacherReply && <p className="mt-1 rounded bg-surface-2 p-2 text-sm"><strong>{t("رد المعلم", "Teacher's reply")}:</strong> {h.teacherReply}</p>}
              {h.status === "REFERRED" && <p className="mt-1 text-sm text-warn">{t("بانتظار رد المعلم", "Waiting for the teacher")}</p>}
            </li>
          ))}</ul>
        )}
      </Section>
    </>
  );
}
