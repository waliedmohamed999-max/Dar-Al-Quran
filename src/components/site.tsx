import Link from "next/link";
import { ChevronDown, Globe, Search } from "lucide-react";
import { localePath, translator, type Locale } from "@/lib/i18n";
import type { SocialSettings } from "@/modules/site/config";
import { ActionForm, ThemeToggle } from "./client";
import { MobileMenu } from "./mobile-menu";

export function Logo({ locale }: { locale: Locale }) {
  const t = translator(locale);
  return (
    <Link href={localePath(locale, "/")} className="flex items-center gap-2 no-underline">
      <svg viewBox="0 0 40 40" className="size-9 text-ink" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="8" y="8" width="24" height="24" />
          <rect x="8" y="8" width="24" height="24" transform="rotate(45 20 20)" />
        </g>
        <path d="M14 15c3-1 5 0 6 1 1-1 3-2 6-1v11c-3-1-5 0-6 1-1-1-3-2-6-1z" fill="currentColor" />
      </svg>
      <span className="whitespace-nowrap text-lg font-bold text-ink">{t("دار القرآن الكريم", "Dar Al-Quran")}</span>
    </Link>
  );
}

export function LangSwitch({ locale, path }: { locale: Locale; path: string }) {
  const other: Locale = locale === "ar" ? "en" : "ar";
  return (
    <Link href={localePath(other, path)} hrefLang={other} className="btn btn-ghost btn-sm" prefetch={false}>
      <Globe className="size-4" aria-hidden="true" />
      {other === "ar" ? "العربية" : "English"}
    </Link>
  );
}

export const publicNav = (locale: Locale) => {
  const t = translator(locale);
  return [
    { href: "/", label: t("الرئيسية", "Home") },
    { href: "/about", label: t("عن الدار", "About") },
    { href: "/programs", label: t("البرامج التعليمية", "Programs") },
    { href: "/mushaf", label: t("المصحف المعلم", "Mushaf") },
    { href: "/tajweed", label: t("التجويد والتفسير", "Tajweed & tafsir") },
    { href: "/hadith", label: t("الحديث", "Hadith") },
    { href: "/adhkar", label: t("أذكاري", "Adhkar") },
    { href: "/competitions", label: t("المسابقات", "Competitions") },
    { href: "/library", label: t("المكتبة", "Library") },
    { href: "/news", label: t("أخبار الدار", "News") },
    { href: "/contact", label: t("تواصل معنا", "Contact") },
  ];
};

export function SiteHeader({ locale, signedIn, programs }: { locale: Locale; signedIn: boolean; programs: { slug: string; title: string; summary: string }[] }) {
  const t = translator(locale);
  const lp = (p: string) => localePath(locale, p);
  const nav = publicNav(locale);
  const drop = (n: { href: string; label: string }, content: React.ReactNode) => (
    <li key={n.href} className="group relative">
      <Link className="flex items-center gap-1 rounded-md px-2.5 py-2 hover:bg-surface-2" href={lp(n.href)}>{n.label}<ChevronDown className="size-3.5" aria-hidden="true" /></Link>
      {content}
    </li>
  );
  return (
    <header className="no-print sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur">
      <div className="relative mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-4 py-2.5">
        <Logo locale={locale} />
        <nav aria-label={t("التنقل الرئيسي", "Main")} className="hidden 2xl:block">
          <ul className="flex items-center gap-0.5 text-sm">
            {nav.map((n) => n.href === "/programs" && programs.length ? drop(n, (
              <div className="mega">
                <ul className="grid gap-1 sm:grid-cols-2">
                  {programs.map((p) => <li key={p.slug}><Link className="block rounded-md p-2 hover:bg-surface-2" href={lp(`/programs/${p.slug}`)}><strong className="block text-brand">{p.title}</strong><span className="text-xs text-ink-2">{p.summary}</span></Link></li>)}
                </ul>
              </div>
            )) : n.href === "/tajweed" ? drop(n, (
              <div className="mega mega-sm">
                <Link className="block rounded-md p-2 hover:bg-surface-2" href={lp("/tajweed")}>{t("علم التجويد", "Tajweed")}</Link>
                <Link className="block rounded-md p-2 hover:bg-surface-2" href={lp("/tafsir")}>{t("التفسير", "Tafsir")}</Link>
              </div>
            )) : <li key={n.href}><Link className="rounded-md px-2.5 py-2 hover:bg-surface-2" href={lp(n.href)}>{n.label}</Link></li>)}
          </ul>
        </nav>
        <div className="flex items-center gap-1.5">
          <Link className="btn btn-ghost btn-sm hidden sm:inline-flex" href={lp("/search")} aria-label={t("البحث", "Search")}><Search className="size-4" aria-hidden="true" /></Link>
          <span className="hidden sm:inline-flex"><LangSwitch locale={locale} path="/" /></span>
          <ThemeToggle />
          {signedIn
            ? <Link className="btn btn-primary btn-sm" href={lp("/dashboard")}>{t("لوحتي", "Dashboard")}</Link>
            : <>
                <Link className="btn btn-ghost btn-sm hidden sm:inline-flex" href={lp("/login")}>{t("تسجيل الدخول", "Sign in")}</Link>
                <Link className="btn btn-primary btn-sm hidden whitespace-nowrap min-[430px]:inline-flex" href={lp("/register")}>{t("ابدأ رحلتك", "Get started")}</Link>
              </>}
          <MobileMenu
            items={[...nav, { href: "/tafsir", label: t("التفسير", "Tafsir") }, { href: "/search", label: t("البحث", "Search") }, ...(signedIn ? [] : [{ href: "/login", label: t("تسجيل الدخول", "Sign in") }, { href: "/register", label: t("ابدأ رحلتك", "Get started") }])].map((n) => ({ ...n, href: lp(n.href) }))}
            label={t("القائمة", "Menu")} className="2xl:hidden"
          />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ locale, brandEmail, phone, address, social, programs }: { locale: Locale; brandEmail?: string; phone?: string; address?: string; social: SocialSettings; programs: { slug: string; title: string }[] }) {
  const t = translator(locale);
  const lp = (p: string) => localePath(locale, p);
  const socials = Object.entries(social).filter(([, v]) => v);
  return (
    <footer className="footer no-print">
      <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-14 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-display text-2xl font-bold text-ink">{t("دار القرآن الكريم", "Dar Al-Quran")}</p>
          <p className="mt-2 text-sm">{t("منصة لتعليم القرآن الكريم وتحفيظه ومتابعة الطلاب بإدارة مركزية واحدة.", "A platform to teach and memorize the Quran and follow students, under one central administration.")}</p>
          <div className="mt-3 space-y-1 text-sm">
            {brandEmail && <p><a className="underline" href={`mailto:${brandEmail}`}>{brandEmail}</a></p>}
            {phone && <p dir="ltr" className="text-start">{phone}</p>}
            {address && <p>{address}</p>}
          </div>
          {socials.length > 0 && <ul className="mt-3 flex flex-wrap gap-3 text-sm">{socials.map(([k, v]) => <li key={k}><a className="underline" href={v} rel="noopener noreferrer" target="_blank">{k}</a></li>)}</ul>}
        </div>
        <nav aria-label={t("البرامج", "Programs")}>
          <h2 className="mb-2 font-bold text-ink">{t("البرامج", "Programs")}</h2>
          <ul className="space-y-1 text-sm">{programs.slice(0, 6).map((p) => <li key={p.slug}><Link className="hover:underline" href={lp(`/programs/${p.slug}`)}>{p.title}</Link></li>)}<li><Link className="hover:underline" href={lp("/programs")}>{t("جميع البرامج", "All programs")}</Link></li></ul>
        </nav>
        <nav aria-label={t("موارد", "Resources")}>
          <h2 className="mb-2 font-bold text-ink">{t("موارد التعلم", "Resources")}</h2>
          <ul className="space-y-1 text-sm">
            {[["/mushaf", "المصحف المعلم", "Mushaf"], ["/academy", "الأكاديمية", "Academy"], ["/tajweed", "التجويد", "Tajweed"], ["/tafsir", "التفسير", "Tafsir"], ["/library", "المكتبة", "Library"], ["/news", "الأخبار", "News"], ["/teachers", "المعلمون", "Teachers"], ["/verify", "التحقق من شهادة", "Verify a certificate"], ["/privacy", "سياسة الخصوصية", "Privacy"], ["/terms", "الشروط", "Terms"]].map(([h, ar, en]) => <li key={h}><Link className="hover:underline" href={lp(h)}>{t(ar, en)}</Link></li>)}
          </ul>
        </nav>
        <div>
          <h2 className="mb-2 font-bold text-ink">{t("النشرة البريدية", "Newsletter")}</h2>
          <div className="footer-form">
            <fieldset disabled={process.env.CLIENT_PREVIEW === "true"}><ActionForm path="/newsletter" submit={t("اشتراك", "Subscribe")} success={t("أرسلنا رابط تأكيد إلى بريدك.", "We sent a confirmation link.")} fields={[
              { name: "email", label: t("البريد الإلكتروني", "Email"), type: "email", required: true, full: true },
              { name: "consent", label: t("أوافق على استلام نشرة الدار، ويمكنني الإلغاء متى شئت.", "I agree to receive the newsletter and can unsubscribe at any time."), type: "checkbox", required: true, full: true },
            ]} /></fieldset>
          </div>
        </div>
      </div>
      <div className="border-t border-line px-4 py-4 text-center text-xs text-ink-2">
        {t("نص المصحف من مشروع تنزيل (tanzil.net) دون تعديل. توسيم التجويد: cpfair/quran-tajweed (CC BY 4.0). التفسير عبر Quran Foundation. الصوت عبر everyayah.com.", "Quran text from the Tanzil Project (tanzil.net), unmodified. Tajweed annotations: cpfair/quran-tajweed (CC BY 4.0). Tafsir via Quran Foundation. Audio via everyayah.com.")}
      </div>
    </footer>
  );
}
