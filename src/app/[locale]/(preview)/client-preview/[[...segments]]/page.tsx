import Link from "next/link";
import { notFound } from "next/navigation";
import Home from "../../../(public)/page";
import { SiteFooter, SiteHeader } from "@/components/site";
import { GuardianPreview, StudentPreview, TeacherFeedbackPreview } from "@/components/previews";
import { previewPrograms } from "@/lib/client-preview";
import { isLocale, localePath, translator } from "@/lib/i18n";

export const metadata = { robots: { index: false, follow: false } };

export default async function ClientPreview({ params }: { params: Promise<{ locale: string; segments?: string[] }> }) {
  if (process.env.CLIENT_PREVIEW !== "true") notFound();
  const { locale, segments = [] } = await params;
  if (!isLocale(locale)) notFound();
  const t = translator(locale);
  const lp = (path: string) => localePath(locale, path);
  const path = segments[0] ?? "";
  const programs = previewPrograms.map(p => ({ slug: p.slug, title: t(p.titleAr, p.titleEn), summary: t(p.summaryAr, p.summaryEn) }));
  const tabs = [["/", "الرئيسية", "Home"], ["/programs", "البرامج", "Programs"], ["/student", "لوحة الطالب", "Student"], ["/teacher", "لوحة المعلم", "Teacher"], ["/guardian", "ولي الأمر", "Guardian"], ["/admin", "الإدارة", "Admin"]];
  const dashboard = ["student", "dashboard", "account", "register", "login"].includes(path);
  const selectedProgram = path === "programs" ? previewPrograms.find(p => p.slug === segments[1]) : undefined;
  const titles: Record<string,string> = { programs: "البرامج التعليمية", teacher: "لوحة المعلم", guardian: "متابعة ولي الأمر", admin: "لوحة الإدارة", about: "عن دار القرآن الكريم", contact: "تواصل معنا", mushaf: "المصحف المعلم", tajweed: "دروس التجويد", library: "المكتبة التعليمية" };
  return <>
    <div className="border-b border-line bg-surface-2 px-4 py-3 text-center text-sm" role="status">{t("نسخة معاينة للعميل · بيانات توضيحية · التسجيل والحفظ غير متاحين", "Client preview · Illustrative data · Registration and saving are disabled")}</div>
    <SiteHeader locale={locale} signedIn={false} programs={programs} />
    <nav aria-label={t("صفحات المعاينة", "Preview pages")} className="flex flex-wrap justify-center gap-2 border-b border-line px-4 py-3">{tabs.map(([href, ar, en]) => <Link key={href} href={lp(href)} className="btn btn-ghost btn-sm" aria-current={(href === "/" + path || (!path && href === "/")) ? "page" : undefined}>{t(ar, en)}</Link>)}</nav>
    <main id="main">
      {!path ? <Home params={Promise.resolve({ locale })} /> : <section className="mx-auto max-w-6xl px-4 py-12">
        <p className="eyebrow">{t("معاينة التصميم والتجربة", "Design and experience preview")}</p>
        <h1 className="mb-7 text-3xl text-brand">{selectedProgram ? t(selectedProgram.titleAr, selectedProgram.titleEn) : t(titles[path] ?? "رحلتك مع دار القرآن الكريم", "Explore Dar Al-Quran")}</h1>
        {path === "programs" ? <div className="grid gap-5 md:grid-cols-3">{(selectedProgram ? [selectedProgram] : previewPrograms).map(p => <article key={p.slug} className="card"><h2 className="text-xl font-bold">{t(p.titleAr,p.titleEn)}</h2><p className="my-4 text-ink-2">{t(p.summaryAr,p.summaryEn)}</p><Link className="btn btn-primary" href={lp(selectedProgram ? "/student" : "/programs/" + p.slug)}>{t(selectedProgram ? "شاهد تجربة الطالب" : "تفاصيل البرنامج", "Explore")}</Link></article>)}</div>
        : path === "guardian" ? <GuardianPreview locale={locale} />
        : path === "teacher" ? <TeacherFeedbackPreview locale={locale} />
        : path === "admin" ? <><div className="mb-8 grid gap-4 sm:grid-cols-3">{[["الطلاب", "Students", "48"],["الحلقات", "Classes", "6"],["المعلمون", "Teachers", "8"]].map(([ar,en,n])=><div className="card" key={en}><p>{t(ar,en)}</p><strong className="text-3xl">{n}</strong><p className="text-xs text-ink-2">{t("أرقام توضيحية", "Illustrative figures")}</p></div>)}</div><TeacherFeedbackPreview locale={locale} /></>
        : dashboard ? <><p className="mb-6 text-ink-2">{t("يمكنك مراجعة شكل لوحة الطالب مباشرة دون إنشاء حساب. بيانات هذه الشاشة للتوضيح فقط.", "Review the student dashboard without an account. All displayed data is illustrative.")}</p><StudentPreview locale={locale} /></>
        : <><div className="card mb-8"><h2 className="mb-3 text-xl">{t("تعلم مستمر ومتابعة خطوة بخطوة", "Learn with guidance at every step")}</h2><p>{t("دار القرآن الكريم تجمع برامج الحفظ والتلاوة والتجويد مع متابعة المعلم وولي الأمر. هذه الصفحة تعرض اتجاه التصميم في النسخة المؤقتة؛ المحتوى المتصل والخدمات الفعلية تضاف بعد مراجعة العميل.", "Dar Al-Quran brings together memorization, recitation and tajweed with teacher and guardian follow-up. This temporary page previews the design; connected content and services follow client review.")}</p></div><StudentPreview locale={locale} /></>}
      </section>}
    </main>
    <SiteFooter locale={locale} social={{}} programs={programs} />
  </>;
}
