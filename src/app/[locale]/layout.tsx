import type { Metadata } from "next";
import { Amiri_Quran, IBM_Plex_Sans_Arabic } from "next/font/google";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ThemeProvider } from "next-themes";
import "../globals.css";
import { LocaleProvider } from "@/components/client";
import { isLocale, translator } from "@/lib/i18n";

const plex = IBM_Plex_Sans_Arabic({ subsets: ["arabic", "latin"], weight: ["400", "700"], variable: "--font-plex", display: "optional" });
// optional, not swap: the interface font must not repaint the largest text on slow connections. Quran text keeps swap below.
// Not preloaded: the browser fetches it only on pages that actually show Quran text.
const amiriQuran = Amiri_Quran({ subsets: ["arabic"], weight: "400", variable: "--font-amiri-quran", display: "swap", preload: false });

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = translator(locale === "en" ? "en" : "ar");
  const name = t("دار القرآن الكريم", "Dar Al-Quran");
  const description = t("منصة لتعليم القرآن الكريم وتحفيظه: مصحف معلم، تجويد، تفسير موثق، حلقات وبرنامج يومي لكل طالب.", "A platform to teach and memorize the Quran: teaching mushaf, tajweed, documented tafsir, halaqas and a daily program.");
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
    title: { default: name, template: `%s | ${name}` },
    description,
    openGraph: { siteName: name, title: name, description, type: "website", locale: locale === "en" ? "en_US" : "ar_SA" },
    twitter: { card: "summary", title: name, description },
    alternates: { languages: { ar: "/", en: "/en" } },
  };
}

export default async function RootLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = translator(locale);
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} suppressHydrationWarning className={`${plex.variable} ${amiriQuran.variable}`}>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem nonce={nonce}>
          <LocaleProvider locale={locale}>
            <a href="#main" className="skip-link">{t("انتقل إلى المحتوى", "Skip to content")}</a>
            {children}
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
