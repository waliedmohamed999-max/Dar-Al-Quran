import Link from "next/link";
import { notFound } from "next/navigation";
import { Empty, Notice, PageHeader, Section } from "@/components/ui";
import { systemDb } from "@/lib/db";
import { pageCtx, type PageParams } from "@/lib/page";
import { getActor } from "@/lib/session";
import { ActionButton } from "@/components/client";
import { LessonQuiz } from "@/components/v3";
import { lessonQuestions } from "@/modules/unified/service";
import { approved } from "@/lib/scholarly";
import { visibleExamples } from "@/lib/scholarly";

export default async function RulePage({ params }: PageParams<{ slug: string }>) {
  const { locale, t, lp } = await pageCtx(params);
  const { slug } = await params;
  const rule = await systemDb().tajweedRule.findFirst({
    where: { slug, ...approved() },
    include: { examples: { where: { ...visibleExamples() }, include: { ayah: { include: { surah: true } } } } },
  });
  if (!rule) notFound();
  const [questions, actor] = await Promise.all([lessonQuestions(slug), getActor()]);
  const progress = actor?.studentId ? await systemDb().lessonProgress.findUnique({ where: { studentId_ruleSlug: { studentId: actor.studentId, ruleSlug: slug } } }) : null;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader title={locale === "ar" ? rule.titleAr : rule.titleEn} subtitle={t(`المستوى ${rule.level} · رواية حفص عن عاصم`, `Level ${rule.level} · Hafs from Asim`)} />
      {rule.reviewedBy === "demo-seed" && <Notice tone="warn">{t("نص تجريبي بانتظار المراجعة العلمية.", "Demo text awaiting scholarly review.")}</Notice>}
      <Section title={t("الشرح", "Explanation")}><p>{locale === "ar" ? rule.bodyAr : rule.bodyEn}</p></Section>
      {(rule.videoUrl || rule.audioUrl) && (
        <Section title={t("شرح مرئي وصوتي", "Video and audio explanation")}>
          {rule.videoUrl && <video controls preload="none" src={rule.videoUrl} className="w-full rounded-lg" />}
          {rule.audioUrl && <audio controls preload="none" src={rule.audioUrl} className="mt-2 w-full" />}
          <p className="mt-1 text-xs text-ink-2">{rule.mediaSource} · {rule.mediaLicense}</p>
        </Section>
      )}
      <Section title={t("أمثلة قرآنية", "Quranic examples")}>
        {rule.examples.length === 0 ? <Empty title={t("لم تربط أمثلة بعد.", "No examples linked yet.")} hint={t("يضيفها المختص بعد التحقق، ويستعان بالمعلم في التطبيق.", "A specialist adds them after checking; practise with your teacher.")} /> : (
          <>
            {rule.examples.some((e) => e.reviewStatus === "PENDING") && <p className="mb-2 text-sm text-warn">{t("هذه أمثلة مرشحة آلياً من بيانات التوسيم وبانتظار تدقيق المختص.", "These examples were selected automatically from annotation data and await specialist review.")}</p>}
            <ul className="space-y-3">
              {rule.examples.map((e) => (
                <li key={e.id} className="border-b border-line pb-3 last:border-0">
                  <p className="quran" lang="ar" dir="rtl" style={{ "--quran-size": "1.5rem" } as React.CSSProperties}>{e.excerpt}</p>
                  <Link className="text-sm underline" href={lp(`/mushaf/surah/${e.ayah.surahId}?ayah=${e.ayah.ayahNumber}`)}>{locale === "ar" ? e.ayah.surah.nameArabic : e.ayah.surah.nameEnglish} : {e.ayah.ayahNumber} — {t("استمع في المصحف", "Listen in the mushaf")}</Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>
      <Section title={t("سؤال قصير", "Short quiz")}>
        {questions.length === 0 ? <Empty title={t("لم تضف أسئلة لهذا الدرس بعد.", "No questions for this lesson yet.")} /> : <LessonQuiz slug={slug} questions={questions as never} canSubmit={Boolean(actor?.studentId)} />}
      </Section>
      {actor?.studentId && (
        <Section title={t("تقدمي في الدرس", "My lesson progress")}>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {progress?.scorePercent != null && <span>{t("آخر نتيجة", "Latest result")}: {progress.scorePercent}%</span>}
            {progress?.completedAt ? <span className="text-ok">{t("مكتمل", "Completed")}</span> : <ActionButton path={`/lessons/${slug}/complete`} label={t("أكملت الدرس", "Lesson completed")} />}
            {progress?.teacherNote && <span className="rounded bg-surface-2 px-2 py-1">{t("ملاحظة المعلم", "Teacher's note")}: {progress.teacherNote}</span>}
          </div>
        </Section>
      )}
    </div>
  );
}
