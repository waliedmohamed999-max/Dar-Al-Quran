import { ActionForm } from "@/components/client";
import { PageHeader, Section } from "@/components/ui";
import { systemDb } from "@/lib/db";
import { guard, pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "قوالب الإشعارات | Templates", robots: { index: false } };

export default async function Templates({ params }: PageParams) {
  const { locale, t } = await pageCtx(params);
  await guard(locale, "notifications.manage");
  const list = await systemDb().notificationTemplate.findMany({ orderBy: { key: "asc" } });
  return (
    <>
      <PageHeader title={t("قوالب الإشعارات", "Notification templates")} subtitle={t("يستبدل ما بين الأقواس المعقوفة عند الإرسال، مثل {date}.", "Text in braces is replaced when sent, such as {date}.")} />
      {list.map((x) => (
        <Section key={x.key} title={x.key}>
          <ActionForm path={`/notification-templates/${x.key}`} method="PUT" resetOnSuccess={false} submit={t("حفظ", "Save")} fields={[
            { name: "titleAr", label: t("العنوان بالعربية", "Title (Arabic)"), required: true, defaultValue: x.titleAr },
            { name: "titleEn", label: t("العنوان بالإنجليزية", "Title (English)"), required: true, defaultValue: x.titleEn },
            { name: "bodyAr", label: t("النص بالعربية", "Body (Arabic)"), type: "textarea", required: true, max: 2, defaultValue: x.bodyAr },
            { name: "bodyEn", label: t("النص بالإنجليزية", "Body (English)"), type: "textarea", required: true, max: 2, defaultValue: x.bodyEn },
          ]} />
        </Section>
      ))}
    </>
  );
}
