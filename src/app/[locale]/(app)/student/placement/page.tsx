import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/client";
import { PlacementWizard } from "@/components/v3";
import { Notice, PageHeader, Section } from "@/components/ui";
import { systemDb } from "@/lib/db";
import { WEEKDAYS } from "@/lib/i18n";
import { guard, pageCtx, type PageParams } from "@/lib/page";
import { getPlacement, placementQuestions, practiceItems } from "@/modules/unified/service";
import { PracticeRun } from "@/components/placement-aids";

export const metadata = { title: "تحديد المستوى | Placement", robots: { index: false } };

export default async function Placement({ params }: PageParams) {
  const { locale, t, lp } = await pageCtx(params);
  const actor = await guard(locale);
  if (!actor.studentId) notFound();
  const p = await getPlacement(actor);
  if (p.status !== "DRAFT") {
    return (
      <>
        <PageHeader title={t("تحديد المستوى", "Placement")} />
        <Section title={p.status === "SUBMITTED" ? t("قيد مراجعة المعلم", "With the teacher for review") : t("اعتمد المعلم مستواك", "Your teacher confirmed your level")}>
          <p className="mb-3 text-sm text-ink-2">{p.status === "SUBMITTED" ? t("يراجع المعلم تسجيلاتك وإجاباتك، وسيصلك إشعار عند الاعتماد.", "A teacher is reviewing your recordings and answers. You will be notified.") : t("يمكنك طباعة ملفك أو بدء تقييم جديد عند الحاجة.", "You can print your profile or start a new assessment when needed.")}</p>
          <div className="flex flex-wrap gap-2">
            {p.status === "APPROVED" && <Link className="btn btn-primary" href={lp("/student/placement/report")}>{t("ملف المستوى", "Level profile")}</Link>}
            {p.status === "APPROVED" && <ActionButton path="/placement/restart" label={t("تقييم جديد", "New assessment")} />}
          </div>
        </Section>
      </>
    );
  }
  const [questions, passages, surahs] = await Promise.all([
    placementQuestions(),
    systemDb().quranAyah.findMany({ where: { surahId: 1 }, orderBy: { id: "asc" }, select: { id: true, surahId: true, ayahNumber: true, text: true } }),
    systemDb().quranSurah.findMany({ orderBy: { id: "asc" }, select: { id: true, nameArabic: true, nameEnglish: true } }),
  ]);
  return (
    <>
      <PageHeader title={t("تحديد المستوى", "Placement")} subtitle={t("خمس مراحل تحفظ تلقائياً، ويعتمد نتيجتها المعلم.", "Five stages saved as you go, with the result confirmed by a teacher.")} />
      <Notice>{t("نجمع ما يلزم للتعليم فقط. للقاصر يلزم موافقة ولي الأمر قبل التسجيلات الصوتية.", "We collect only what teaching needs. Minors need guardian consent before recordings.")}</Notice>
      {!p.practiceCompletedAt && p.stage === 1 && <PracticeRun ayahs={await practiceItems()} />}
      <PlacementWizard
        initial={{ stage: p.stage, status: p.status, intake: p.intake as Record<string, unknown>, tajweedAnswers: p.tajweedAnswers as Record<string, string>, readingFileId: p.readingFileId, memorizationFileId: p.memorizationFileId }}
        questions={questions as never}
        passages={passages}
        surahs={surahs.map((s) => ({ id: s.id, name: locale === "ar" ? s.nameArabic : s.nameEnglish }))}
        days={WEEKDAYS[locale]}
      />
    </>
  );
}
