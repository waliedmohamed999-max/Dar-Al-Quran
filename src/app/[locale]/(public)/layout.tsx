import { SiteFooter, SiteHeader } from "@/components/site";
import { pageCtx, type PageParams } from "@/lib/page";
import { getActor } from "@/lib/session";
import { getSetting } from "@/modules/cms/service";
import type { SocialSettings } from "@/modules/site/config";
import { listPrograms } from "@/modules/site/service";

export default async function PublicLayout({ children, params }: PageParams & { children: React.ReactNode }) {
  const { locale, t } = await pageCtx(params);
  const [actor, contact, social, programs] = await Promise.all([getActor(), getSetting<{ email?: string; phone?: string; address?: string }>("contact", {}), getSetting<SocialSettings>("social", {}), listPrograms()]);
  const named = programs.map((p) => ({ slug: p.slug, title: locale === "ar" ? p.titleAr : p.titleEn, summary: locale === "ar" ? p.summaryAr : p.summaryEn }));
  const ld = { "@context": "https://schema.org", "@type": "EducationalOrganization", name: t("دار القرآن الكريم", "Dar Al-Quran"), url: process.env.NEXT_PUBLIC_APP_URL };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <SiteHeader locale={locale} signedIn={Boolean(actor)} programs={named} />
      <main id="main">{children}</main>
      <SiteFooter locale={locale} brandEmail={contact.email} phone={contact.phone} address={contact.address} social={social} programs={named} />
    </>
  );
}
