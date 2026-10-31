import Link from "next/link";
import { notFound } from "next/navigation";
import { HadithTrainer } from "@/components/v3";
import { ActionButton } from "@/components/client";
import { Notice, PageHeader, Section } from "@/components/ui";
import { systemDb } from "@/lib/db";
import { pageCtx, type PageParams } from "@/lib/page";
import { getActor } from "@/lib/session";
import { approved } from "@/lib/scholarly";

export default async function HadithPage({ params }: PageParams<{ slug: string; n: string }>) {
  const { t, lp } = await pageCtx(params);
  const { slug, n } = await params;
  const e = await systemDb().hadithEntry.findFirst({ where: { number: Number(n) || 0, ...approved(), collection: { slug, published: true } }, include: { collection: true } });
  if (!e) notFound();
  const actor = await getActor();
  const vocabulary = (e.vocabulary as { word: string; meaning: string }[] | null) ?? [];
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <PageHeader title={t(`الحديث ${e.number}`, `Hadith ${e.number}`)} subtitle={e.collection.titleAr} actions={actor?.studentId ? <ActionButton path={`/hadith/${e.id}/start`} label={t("إضافة إلى خطتي", "Add to my plan")} success={t("أضيف", "Added")} variant="primary" /> : undefined} />
      <Section title={t("التدريب والحفظ", "Practice and memorization")}><HadithTrainer id={e.id} text={e.text} signedIn={Boolean(actor)} isStudent={Boolean(actor?.studentId)} /></Section>
      <Section title={t("التوثيق", "Documentation")}>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-ink-2">{t("المرجع", "Reference")}</dt><dd>{e.sourceRef ?? "—"}</dd></div>
          <div><dt className="text-ink-2">{t("الحكم", "Grade")}</dt><dd>{e.grade ? `${e.grade} (${e.gradeSource})` : t("لم يوثق بعد من مرجع معتمد", "Not yet documented from an approved reference")}</dd></div>
        </dl>
      </Section>
      <Section title={t("الشرح والفوائد", "Explanation and lessons")}>
        {e.explanation ? <p>{e.explanation} <span className="text-xs text-ink-2">({e.explanationSource})</span></p> : <Notice>{t("لم يضف شرح من مصدر معتمد بعد. لا تولد المنصة شروحاً.", "No explanation from an approved source yet. The platform does not generate explanations.")}</Notice>}
        {e.benefits && <p className="mt-2">{e.benefits}</p>}
        {vocabulary.length > 0 && <dl className="mt-2 text-sm">{vocabulary.map((v) => <div key={v.word}><dt className="inline font-semibold">{v.word}: </dt><dd className="inline">{v.meaning}</dd></div>)}</dl>}
      </Section>
      <nav className="flex justify-between" aria-label={t("التنقل", "Navigation")}><Link className="underline" href={lp(`/hadith/${slug}`)}>{t("كل الأحاديث", "All hadiths")}</Link><Link className="underline" href={lp(`/hadith/${slug}/${e.number + 1}`)}>{t("التالي", "Next")}</Link></nav>
    </div>
  );
}
