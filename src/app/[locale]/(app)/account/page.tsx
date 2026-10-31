import { ActionForm } from "@/components/client";
import { PageHeader, Section } from "@/components/ui";
import { withActor } from "@/lib/db";
import { guard, pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "الحساب | Account", robots: { index: false } };

export default async function Account({ params }: PageParams) {
  const { t } = await pageCtx(params);
  const { locale } = await params;
  const actor = await guard(locale === "en" ? "en" : "ar");
  const prefs = await withActor(actor, (tx) => tx.notificationPreference.findUnique({ where: { userId: actor.id } }));
  return (
    <>
      <PageHeader title={t("الحساب والخصوصية", "Account and privacy")} subtitle={actor.email} actions={<a className="btn btn-ghost" href={locale === "en" ? "/en/account/security" : "/account/security"}>{t("أمان الحساب", "Account security")}</a>} />
      <Section title={t("إعدادات الإشعارات", "Notification settings")}>
        <ActionForm
          path="/me/preferences"
          method="PUT"
          resetOnSuccess={false}
          submit={t("حفظ", "Save")}
          transform="preferences"
          fields={[
            { name: "emailEnabled", label: t("استلام الإشعارات بالبريد", "Receive email notifications"), type: "checkbox", defaultValue: prefs?.emailEnabled ?? true },
            { name: "maxEmailsPerDay", label: t("أقصى عدد رسائل في اليوم", "Maximum emails per day"), type: "number", min: 0, max: 20, defaultValue: prefs?.maxEmailsPerDay ?? 5 },
            {
              name: "mutedTypes", label: t("إيقاف أنواع من الإشعارات", "Mute notification types"), type: "multiselect", full: true, defaultValue: prefs?.mutedTypes ?? [],
              options: [["task.reminder", "تذكيرات الورد", "Task reminders"], ["session.reminder", "تذكيرات الحصص", "Session reminders"], ["report.weekly", "التقارير الأسبوعية", "Weekly reports"], ["task.assigned", "مهام جديدة", "New tasks"]].map(([value, ar, en]) => ({ value, label: t(ar, en) })),
            },
          ]}
        />
      </Section>
      <Section title={t("بياناتك", "Your data")}>
        <p className="mb-3 text-sm text-ink-2">{t("يمكنك تنزيل نسخة من بياناتك الشخصية وسجلاتك التعليمية. لطلب حذف الحساب تواصل مع إدارة الدار.", "You can download a copy of your personal data and learning records. To request account deletion, contact the administration.")}</p>
        <a className="btn btn-ghost" href="/api/v1/me/export" download="my-data.json">{t("تنزيل بياناتي", "Download my data")}</a>
      </Section>
    </>
  );
}
