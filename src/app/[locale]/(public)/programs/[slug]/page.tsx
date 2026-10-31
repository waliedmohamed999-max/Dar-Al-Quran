import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, PageHeader } from "@/components/ui";
import { pageCtx, type PageParams } from "@/lib/page";
import { getActor } from "@/lib/session";
import { getProgram } from "@/modules/site/service";

type P = PageParams<{ slug: string }>;
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { slug, locale } = await params;
  const p = await getProgram(slug);
  if (!p) return {};
  const title = locale === "en" ? p.titleEn : p.titleAr;
  const description = locale === "en" ? p.summaryEn : p.summaryAr;
  return { title, description, openGraph: { title, description } };
}

export default async function ProgramPage({ params }: P) {
  const { locale, t, lp } = await pageCtx(params);
  const p = await getProgram((await params).slug);
  if (!p) notFound();
  const actor = await getActor();
  const blocks: [string, string[]][] = [
    [t("أهداف التعلم", "Learning objectives"), p.objectivesAr], [t("الفئة المستهدفة", "Target audience"), p.audienceAr], [t("المستويات", "Levels"), p.levelsAr],
    [t("هيكل المنهج", "Curriculum structure"), p.curriculumAr], [t("نواتج التعلم المتوقعة", "Expected outcomes"), p.outcomesAr], [t("متطلبات الالتحاق", "Requirements"), p.requirementsAr],
  ];
  const ld = { "@context": "https://schema.org", "@type": "Course", name: locale === "en" ? p.titleEn : p.titleAr, description: locale === "en" ? p.summaryEn : p.summaryAr, provider: { "@type": "EducationalOrganization", name: t("دار القرآن الكريم", "Dar Al-Quran") } };
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <PageHeader title={locale === "en" ? p.titleEn : p.titleAr} subtitle={locale === "en" ? p.summaryEn : p.summaryAr} />
      {locale === "en" && <Notice>Detailed program content is currently available in Arabic.</Notice>}
      {p.requiresQualifiedTeachers && <Notice tone="warn">{t("يفتح هذا المسار عند توفر معلمين مؤهلين ومتحقق منهم.", "This track opens when verified, qualified teachers are available.")}</Notice>}
      <section className="card mb-5"><h2 className="mb-2 text-xl text-brand">{t("نظرة عامة", "Overview")}</h2><p lang="ar" dir="rtl">{p.overviewAr}</p></section>
      <div className="grid gap-4 md:grid-cols-2">
        {blocks.filter(([, v]) => v.length).map(([title, v]) => <section key={title} className="card"><h2 className="mb-2 text-xl text-brand">{title}</h2><ul lang="ar" dir="rtl" className="list-disc space-y-1 ps-5">{v.map((x) => <li key={x}>{x}</li>)}</ul></section>)}
      </div>
      <section className="card my-5"><h2 className="mb-2 text-xl text-brand">{t("المعلمون", "Instructors")}</h2><p className="text-ink-2">{p.instructorNoteAr || t("تعلن الدار بيانات المعلمين بعد التحقق منها، ويحدد المعلم عند الانضمام إلى الحلقة.", "The school publishes instructor details after verification. Your teacher is set when you join a halaqa.")}</p></section>
      <Link className="btn btn-primary" href={lp(actor?.studentId ? "/student/halaqas" : "/register")}>{actor?.studentId ? t("اختر حلقة", "Choose a halaqa") : t("سجل في البرنامج", "Register for this program")}</Link>
    </div>
  );
}
