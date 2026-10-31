import { ActionForm } from "@/components/client";
import { PageHeader, Section } from "@/components/ui";
import { guard, pageCtx, type PageParams } from "@/lib/page";
import { getSetting } from "@/modules/cms/service";
import { HOME_SECTIONS, type HomeSettings, type SeoSettings, type SocialSettings } from "@/modules/site/config";

export const metadata = { title: "الموقع العام | Public site", robots: { index: false } };

export default async function AdminSite({ params }: PageParams) {
  const { locale, t } = await pageCtx(params);
  await guard(locale, "settings.manage");
  const [home, seo, social] = await Promise.all([getSetting<HomeSettings>("home", {}), getSetting<SeoSettings>("seo", {}), getSetting<SocialSettings>("social", {})]);
  return (
    <>
      <PageHeader title={t("الموقع العام", "Public site")} subtitle={t("تدار البرامج والأخبار والمكتبة والأسئلة الشائعة من صفحاتها.", "Programs, news, library and FAQs are managed on their own pages.")} />
      <Section title={t("الصفحة الرئيسية", "Home page")}>
        <ActionForm path="/settings/site" method="PUT" transform="homeSettings" resetOnSuccess={false} submit={t("حفظ", "Save")} fields={[
          { name: "heroTitleAr", label: t("عنوان الواجهة", "Hero title"), full: true, defaultValue: home.heroTitleAr },
          { name: "heroTextAr", label: t("نص الواجهة", "Hero text"), type: "textarea", defaultValue: home.heroTextAr },
          { name: "ctaPrimaryAr", label: t("الزر الرئيسي", "Primary button"), defaultValue: home.ctaPrimaryAr },
          { name: "ctaFinalAr", label: t("عنوان الدعوة الختامية", "Final call to action"), defaultValue: home.ctaFinalAr },
          { name: "hidden", label: t("أقسام مخفية", "Hidden sections"), type: "multiselect", full: true, defaultValue: home.hidden ?? [], options: HOME_SECTIONS.map(([value, ar, en]) => ({ value, label: t(ar, en) })) },
        ]} />
      </Section>
      <Section title={t("محركات البحث", "Search engines")}>
        <ActionForm path="/settings/site" method="PUT" transform="seoSettings" resetOnSuccess={false} submit={t("حفظ", "Save")} fields={[
          { name: "descriptionAr", label: t("الوصف بالعربية", "Description (Arabic)"), full: true, defaultValue: seo.descriptionAr },
          { name: "descriptionEn", label: t("الوصف بالإنجليزية", "Description (English)"), full: true, defaultValue: seo.descriptionEn },
        ]} />
      </Section>
      <Section title={t("حسابات التواصل", "Social accounts")}>
        <ActionForm path="/settings/site" method="PUT" transform="socialSettings" resetOnSuccess={false} submit={t("حفظ", "Save")} fields={(["youtube", "x", "facebook", "instagram"] as const).map((k) => ({ name: k, label: k, type: "url" as const, defaultValue: social[k] }))} />
      </Section>
    </>
  );
}
