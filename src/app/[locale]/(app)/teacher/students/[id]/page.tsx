import Link from "next/link";
import { notFound } from "next/navigation";
import { SKILL_LABELS } from "@/modules/unified/labels";
import { currentSkills, revisionQueue } from "@/modules/unified/service";
import { ActionForm } from "@/components/client";
import { ProgressView } from "@/components/progress-view";
import { TaskList } from "@/components/task-list";
import { Empty, PageHeader, Section, StatusBadge, Table } from "@/components/ui";
import { systemDb, withActor } from "@/lib/db";
import { fmtDate, TASK_TYPES } from "@/lib/i18n";
import { guard, pageCtx, type PageParams } from "@/lib/page";
import { studentProgress } from "@/modules/learning/service";
import { suggestNextPlan } from "@/modules/ai/guard";
import { addDays, dayOnly } from "@/modules/learning/srs";
import { REVISION_REASONS } from "@/modules/unified/labels";

export const metadata = { title: "ملف الطالب | Student", robots: { index: false } };

export default async function StudentFile({ params }: PageParams<{ id: string }>) {
  const { locale, t, lp } = await pageCtx(params);
  const actor = await guard(locale, "plans.manage");
  const studentId = (await params).id;
  const today = dayOnly(new Date());
  // RLS returns null for a student outside this teacher's scope, so the page 404s.
  const data = await withActor(actor, async (tx) => {
    const student = await tx.student.findUnique({ where: { id: studentId }, include: { user: { select: { name: true } } } });
    if (!student) return null;
    return {
      student,
      plan: await tx.learningPlan.findFirst({ where: { studentId, status: "ACTIVE" } }),
      today: await tx.dailyTask.findMany({ where: { studentId, date: today, status: { not: "CARRIED_OVER" } }, orderBy: { sortOrder: "asc" } }),
      history: await tx.dailyTask.findMany({ where: { studentId }, orderBy: { date: "desc" }, take: 40 }),
      due: await tx.memorizationRecord.findMany({ where: { studentId, status: "APPROVED" }, orderBy: { nextReviewAt: "asc" } }),
      reviews: await tx.teacherReview.findMany({ where: { studentId }, orderBy: { createdAt: "desc" }, take: 10 }),
      lessons: await tx.lessonProgress.findMany({ where: { studentId }, orderBy: { updatedAt: "desc" } }),
    };
  });
  if (!data) notFound();
  const [progress, skills, queue] = await Promise.all([studentProgress(actor, studentId), currentSkills(actor, studentId), revisionQueue(actor, studentId)]);
  const suggestion = suggestNextPlan({ donePercent: progress.tasksDonePercent, mastery: progress.revisionMastery, newAyahsPerDay: data.plan?.newAyahsPerDay ?? 3 });
  const reasons = { insufficient_data: t("لا توجد سجلات كافية بعد.", "Not enough records yet."), consolidate: t("الإنجاز أو إتقان المراجعة منخفض، فيقترح تخفيف الجديد والتثبيت.", "Completion or revision is low, so slow down and consolidate."), advance: t("الإنجاز والمراجعة قويان، فيقترح زيادة يسيرة.", "Completion and revision are strong, so a small increase is suggested."), steady: t("الأداء متوازن، فيقترح الإبقاء على الوتيرة.", "Performance is balanced, so keep the pace.") };
  const lessons = data.lessons;
  const surahs = await systemDb().quranSurah.findMany({ orderBy: { id: "asc" }, select: { id: true, nameArabic: true, nameEnglish: true } });
  const names = new Map(surahs.map((s) => [s.id, locale === "ar" ? s.nameArabic : s.nameEnglish]));
  const surahOptions = surahs.map((s) => ({ value: String(s.id), label: `${s.id}. ${names.get(s.id)}` }));

  return (
    <>
      <PageHeader title={data.student.user.name} subtitle={t(`المستوى ${data.student.level}`, `Level ${data.student.level}`)} actions={<Link className="btn btn-ghost" href={lp(`/reports/${studentId}`)}>{t("التقارير", "Reports")}</Link>} />
      <Section title={t("ملف المهارات", "Skills profile")}>{skills.length === 0 ? <Empty title={t("لم يقيم بعد.", "Not assessed yet.")} /> : <ul className="flex flex-wrap gap-2 text-sm">{skills.map((s) => <li key={s.id} className="rounded-full border border-line px-3 py-1">{SKILL_LABELS[s.skill]?.[locale === "ar" ? 0 : 1]}: {s.level}/5</li>)}</ul>}</Section>
      <Section title={t("أولويات المراجعة المقترحة", "Suggested revision priorities")}>{queue.length === 0 ? <Empty title={t("لا توجد مقاطع معتمدة.", "No approved segments.")} /> : <ol className="space-y-3 text-sm">{queue.slice(0, 8).map((q) => <li key={q.id} className="border-b border-line pb-2"><p><strong>{names.get(q.surahId)} ({q.fromAyah}–{q.toAyah})</strong> <span className="text-xs text-ink-2">{q.reasons.map((r) => REVISION_REASONS[r][locale === "ar" ? 0 : 1]).join(" · ")}</span></p><ActionForm path={`/memorizations/${q.id}/difficulty`} method="PUT" resetOnSuccess={false} submit={t("حفظ الصعوبة", "Save difficulty")} fields={[{ name: "difficulty", label: t(`الصعوبة التعليمية (المؤشر من النتائج: ${q.suggestedDifficulty})`, `Teaching difficulty (indicator from results: ${q.suggestedDifficulty})`), type: "number", min: 1, max: 5, required: true, defaultValue: q.difficulty ?? undefined }, { name: "note", label: t("ملاحظة", "Note"), defaultValue: q.difficultyNote ?? undefined }]} /></li>)}</ol>}</Section>
      <ProgressView p={progress} locale={locale} />

      <Section title={t("خطة الحفظ", "Memorization plan")}>
        <p className="mb-3 rounded bg-surface-2 p-2 text-sm"><strong>{t("الخطة التالية المقترحة", "Suggested next plan")}:</strong> {t(`${suggestion.newAyahsPerDay} آيات يومياً.`, `${suggestion.newAyahsPerDay} ayahs daily.`)} {reasons[suggestion.reason]} {t("لا يطبق الاقتراح إلا بعد حفظك للخطة.", "It applies only when you save the plan.")}</p>
        {data.plan && <p className="mb-3 text-sm">{t(`الخطة الحالية: ${data.plan.newAyahsPerDay} آيات يومياً و${data.plan.dailyMinutes} دقيقة. عند الحفظ تنتهي الخطة السابقة مع بقاء سجلها.`, `Current plan: ${data.plan.newAyahsPerDay} ayahs daily, ${data.plan.dailyMinutes} minutes. Saving ends it and keeps its history.`)}</p>}
        <ActionForm
          path="/plans"
          submit={t("حفظ الخطة", "Save plan")}
          transform="plan"
          fields={[
            { name: "studentId", label: "", type: "hidden", defaultValue: studentId },
            { name: "goal", label: t("الهدف", "Goal") },
            { name: "dailyMinutes", label: t("الوقت اليومي بالدقائق", "Daily minutes"), type: "number", required: true, min: 10, max: 240, defaultValue: data.plan?.dailyMinutes ?? 30 },
            { name: "newAyahsPerDay", label: t("آيات جديدة يومياً", "New ayahs per day"), type: "number", required: true, min: 1, max: 40, defaultValue: suggestion.newAyahsPerDay },
            { name: "direction", label: t("الاتجاه", "Direction"), type: "select", required: true, defaultValue: data.plan?.direction ?? "REVERSE", options: [{ value: "REVERSE", label: t("من الناس إلى البقرة", "From An-Nas backward") }, { value: "FORWARD", label: t("من الفاتحة إلى الناس", "From Al-Fatiha forward") }] },
            { name: "cursorSurah", label: t("البدء من سورة", "Start from surah"), type: "select", required: true, defaultValue: String(data.plan?.cursorSurah ?? 114), options: surahOptions },
            { name: "cursorAyah", label: t("البدء من آية", "Start from ayah"), type: "number", min: 1, defaultValue: data.plan?.cursorAyah ?? 1 },
          ]}
        />
      </Section>

      <Section title={t("مهام اليوم", "Today's tasks")}>
        {data.today.length === 0 ? <Empty title={t("لا توجد مهام لهذا اليوم.", "No tasks today.")} /> : <TaskList tasks={data.today} surahNames={names} locale={locale} editable tomorrow={addDays(today, 1).toISOString()} />}
      </Section>

      <Section title={t("مراجعة الحفظ المعتمد", "Grade approved memorization")}>
        {data.due.length === 0 ? <Empty title={t("لا توجد مقاطع معتمدة بعد.", "No approved segments yet.")} /> : (
          <ul className="space-y-4">
            {data.due.map((m) => (
              <li key={m.id} className="border-b border-line pb-3">
                <p className="mb-2 font-semibold">{names.get(m.surahId)} ({m.fromAyah}–{m.toAyah}) <span className="text-sm font-normal text-ink-2">{t("المراجعة القادمة", "Next due")}: {m.nextReviewAt ? fmtDate(locale, m.nextReviewAt) : "—"}</span></p>
                <ActionForm
                  path={`/memorizations/${m.id}/revisions`}
                  submit={t("تسجيل التقييم", "Record grade")}
                  fields={[
                    { name: "quality", label: t("جودة المراجعة (1 يحتاج إلى عناية، 5 ممتاز)", "Quality (1 needs care, 5 excellent)"), type: "select", required: true, defaultValue: "4", options: ["1", "2", "3", "4", "5"].map((v) => ({ value: v, label: v })) },
                    { name: "overrideDays", label: t("تحديد الأيام يدوياً (اختياري)", "Set days manually (optional)"), type: "number", min: 1, max: 365, hint: t("قرارك يقدم على الحساب التلقائي.", "Your decision overrides the calculated interval.") },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t("ملاحظة على درس تجويد", "Note on a tajweed lesson")}>
        <p className="mb-2 text-sm text-ink-2">{t("تظهر للطالب في صفحة الدرس.", "The student sees it on the lesson page.")}</p>
        <ul className="space-y-3">{lessons.slice(0, 6).map((l) => <li key={l.ruleSlug}><ActionForm path={`/students/${studentId}/lessons/${l.ruleSlug}/note`} method="PUT" submit={t("حفظ", "Save")} resetOnSuccess={false} fields={[{ name: "note", label: `${l.ruleSlug}${l.scorePercent != null ? ` (${l.scorePercent}%)` : ""}`, full: true, defaultValue: l.teacherNote ?? "" }]} /></li>)}</ul>
        {lessons.length === 0 && <Empty title={t("لم يبدأ الطالب دروساً بعد.", "The student has not started lessons yet.")} />}
      </Section>
      <Section title={t("السجل الزمني", "Timeline")}>
        {data.history.length === 0 ? <Empty title={t("لا يوجد سجل بعد.", "No history yet.")} /> : (
          <Table caption={t("سجل المهام", "Task history")} columns={[t("التاريخ", "Date"), t("المهمة", "Task"), t("النطاق", "Range"), t("الحالة", "Status")]}>
            {data.history.map((h) => <tr key={h.id}><td>{fmtDate(locale, h.date)}</td><td>{TASK_TYPES[h.type][locale]}</td><td>{h.surahId ? `${names.get(h.surahId)} (${h.fromAyah}–${h.toAyah})` : "—"}</td><td><StatusBadge locale={locale} status={h.status} /></td></tr>)}
          </Table>
        )}
      </Section>
    </>
  );
}
