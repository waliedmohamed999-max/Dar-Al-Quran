import { TwoFactorSetup } from "@/components/dash/two-factor";
import { Notice, PageHeader, Section } from "@/components/ui";
import { guard, mfaIsRequired, pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "أمان الحساب | Account security", robots: { index: false } };

export default async function AccountSecurity({ params }: PageParams) {
  const { locale, t } = await pageCtx(params);
  const actor = await guard(locale, undefined, { mfaExempt: true });
  return (
    <>
      <PageHeader title={t("أمان الحساب", "Account security")} subtitle={actor.email} />
      {mfaIsRequired(actor) && !actor.twoFactorEnabled && <Notice tone="warn">{t("حسابك إداري، فيلزم تفعيل المصادقة الثنائية قبل فتح لوحات الإدارة.", "Your account is administrative, so two-factor authentication is required before admin pages open.")}</Notice>}
      <Section title={t("المصادقة الثنائية", "Two-factor authentication")}>
        <TwoFactorSetup enabled={actor.twoFactorEnabled} />
      </Section>
    </>
  );
}
