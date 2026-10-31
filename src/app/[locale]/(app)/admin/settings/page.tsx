import { ActionForm } from "@/components/client";
import { Notice, PageHeader, Section } from "@/components/ui";
import { integrations } from "@/lib/env";
import { guard, pageCtx, type PageParams } from "@/lib/page";
import { getSetting } from "@/modules/cms/service";

export const metadata = { title: "الإعدادات | Settings", robots: { index: false } };

export default async function Settings({ params }: PageParams) {
  const { locale, t } = await pageCtx(params);
  await guard(locale, "settings.manage");
  const [brand, contact] = await Promise.all([
    getSetting<{ nameAr?: string; nameEn?: string; logoUrl?: string }>("brand", {}),
    getSetting<{ email?: string; phone?: string; address?: string }>("contact", {}),
  ]);
  const yes = t("مهيأ", "Configured");
  const no = t("غير مهيأ", "Not configured");
  return (
    <>
      <PageHeader title={t("الإعدادات", "Settings")} />
      <Section title={t("الهوية وبيانات التواصل", "Identity and contact")}>
        <ActionForm path="/settings" method="PUT" resetOnSuccess={false} submit={t("حفظ", "Save")} transform="settingsBrand" fields={[
          { name: "nameAr", label: t("الاسم بالعربية", "Name in Arabic"), required: true, defaultValue: brand.nameAr },
          { name: "nameEn", label: t("الاسم بالإنجليزية", "Name in English"), required: true, defaultValue: brand.nameEn },
          { name: "logoUrl", label: t("رابط الشعار (https)", "Logo URL (https)"), type: "url", defaultValue: brand.logoUrl, full: true },
          { name: "email", label: t("بريد التواصل", "Contact email"), type: "email", defaultValue: contact.email },
          { name: "phone", label: t("الهاتف", "Phone"), defaultValue: contact.phone },
          { name: "address", label: t("العنوان", "Address"), full: true, defaultValue: contact.address },
        ]} />
      </Section>
      <Section title={t("التكاملات", "Integrations")}>
        <Notice>{t("تضبط مفاتيح التكامل عبر متغيرات البيئة ولا تخزن في قاعدة البيانات.", "Integration keys are set through environment variables, never stored in the database.")}</Notice>
        <dl className="grid gap-2 sm:grid-cols-3">
          <div><dt className="text-sm text-ink-2">{t("التخزين الخاص", "Private storage")}</dt><dd className="font-semibold">{integrations.storage ? yes : no}</dd></div>
          <div><dt className="text-sm text-ink-2">{t("البريد", "Email")}</dt><dd className="font-semibold">{integrations.email ? yes : no}</dd></div>
          <div><dt className="text-sm text-ink-2">WhatsApp Business</dt><dd className="font-semibold">{t("لم ينفذ بعد (مؤجل)", "Not implemented yet (deferred)")}</dd></div>
        </dl>
      </Section>
    </>
  );
}
