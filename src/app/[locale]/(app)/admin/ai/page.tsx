import { ActionButton, ActionForm } from "@/components/client";
import { Notice, PageHeader, Section, Stat } from "@/components/ui";
import { systemDb } from "@/lib/db";
import { guard, pageCtx, type PageParams } from "@/lib/page";
import { aiStatus } from "@/modules/ai/service";

export const metadata = { title: "إدارة المعلم الذكي | AI", robots: { index: false } };

export default async function AdminAi({ params }: PageParams) {
  const { locale, t } = await pageCtx(params);
  await guard(locale, "ai.manage");
  const db = systemDb();
  const [status, groups, rules, lib] = await Promise.all([
    aiStatus(), db.aiInteraction.groupBy({ by: ["status"], _count: true }),
    db.tajweedRule.count({ where: { reviewStatus: "APPROVED" } }), db.contentPage.count({ where: { type: "LIBRARY", status: "PUBLISHED" } }),
  ]);
  const n = (s: string) => groups.find((g) => g.status === s)?._count ?? 0;
  return (
    <>
      <PageHeader title={t("إدارة المعلم الذكي", "Manage the AI teacher")} />
      <Notice>{t("عند التفعيل مع نموذج مهيأ، ترسل الأسئلة والمصادر المطابقة إلى مزود الذكاء الاصطناعي دون اسم المستخدم. راجع سياسة الخصوصية قبل التفعيل.", "When enabled with a configured model, questions and matching sources go to the AI provider without the user's name. Review the privacy policy first.")}</Notice>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t("الحالة", "Status")} value={status.enabled ? t("مفعل", "Enabled") : t("غير مفعل", "Disabled")} />
        <Stat label={t("النموذج", "Model")} value={status.providerConfigured ? t("مهيأ", "Configured") : t("غير مهيأ", "Not configured")} hint="AI_ANTHROPIC_API_KEY" />
        <Stat label={t("دروس معتمدة في المعرفة", "Approved lessons in knowledge")} value={rules} />
        <Stat label={t("مواد مكتبة منشورة", "Published library items")} value={lib} />
        <Stat label={t("إجابات", "Answered")} value={n("ANSWERED")} />
        <Stat label={t("مصادر فقط", "Sources only")} value={n("SOURCES_ONLY")} />
        <Stat label={t("محالة للمعلم", "Referred")} value={n("REFERRED")} />
        <Stat label={t("رد عليها معلم", "Resolved by teacher")} value={n("RESOLVED")} />
      </div>
      <Section title={t("التفعيل", "Activation")}>
        <ActionButton path="/ai/settings" method="PUT" body={{ enabled: !status.enabled }} label={status.enabled ? t("إيقاف المساعد", "Disable") : t("تفعيل المساعد", "Enable")} variant={status.enabled ? "danger" : "primary"} />
      </Section>
    </>
  );
}
