import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/client";
import { TaskList } from "@/components/task-list";
import { Award, ClipboardCheck, ListChecks, Map as MapIcon, RefreshCcw } from "lucide-react";
import { Kpi, KpiGrid } from "@/components/dash/kit";
import { Empty, Notice, PageHeader, Progress, Section } from "@/components/ui";
import { TRACK_LABELS } from "@/modules/unified/labels";
import { revisionQueue } from "@/modules/unified/service";
import { systemDb, withActor } from "@/lib/db";
import { fmtDateTime } from "@/lib/i18n";
import { guard, pageCtx, type PageParams } from "@/lib/page";
import { addDays, dayOnly } from "@/modules/learning/srs";
import { completionPercent } from "@/modules/learning/planner";

export const metadata = { title: "برنامج اليوم | Today", robots: { index: false } };

export default async function StudentHome({ params }: PageParams) {
  const { locale, t, lp } = await pageCtx(params);
  const actor = await guard(locale);
  if (!actor.studentId) notFound();
  const studentId = actor.studentId;
  const today = dayOnly(new Date());
  const data = await withActor(actor, async (tx) => ({
    student: await tx.student.findUniqueOrThrow({ where: { id: studentId } }),
    tasks: await tx.dailyTask.findMany({ where: { studentId, date: today, status: { not: "CARRIED_OVER" } }, orderBy: { sortOrder: "asc" } }),
    enrollments: await tx.enrollment.findMany({ where: { studentId, status: "ACTIVE" }, include: { halaqa: { include: { teacher: { include: { user: { select: { name: true } } } } } } } }),
    plan: await tx.learningPlan.findFirst({ where: { studentId, status: "ACTIVE" } }),
    badges: await tx.studentBadge.findMany({ where: { studentId }, include: { badge: true }, orderBy: { awardedAt: "desc" }, take: 3 }),
    mastered: await tx.ayahProgress.count({ where: { studentId, status: "MASTERED" } }),
    scores: await tx.assessmentAttempt.findMany({ where: { studentId, status: "GRADED" }, orderBy: { submittedAt: "desc" }, take: 5, select: { scorePercent: true } }),
    pendingAssessments: await tx.assessment.count({ where: { published: true, attempts: { none: { studentId } }, OR: [{ halaqaId: null }, { halaqa: { enrollments: { some: { studentId, status: "ACTIVE" } } } }] } }),
  }));
  const sessions = await withActor(actor, (tx) => tx.halaqaSession.findMany({
    where: { startsAt: { gte: new Date() }, status: "SCHEDULED", halaqaId: { in: data.enrollments.map((e) => e.halaqaId) } },
    orderBy: { startsAt: "asc" }, take: 3, include: { halaqa: { select: { name: true } } },
  }));
  const [queue, extra] = await Promise.all([revisionQueue(actor, studentId), withActor(actor, async (tx) => ({
    hadith: await tx.hadithMemorization.findMany({ where: { studentId, status: { not: "MASTERED" } }, take: 3, orderBy: { updatedAt: "desc" }, select: { id: true, status: true, hadith: { select: { number: true, collection: { select: { slug: true, titleAr: true } } } } } }),
    notes: await tx.teacherReview.findMany({ where: { studentId, note: { not: null } }, orderBy: { createdAt: "desc" }, take: 2, select: { id: true, note: true } }),
    live: await tx.halaqaSession.count({ where: { isOnline: true, startsAt: { gte: new Date() }, halaqaId: { in: data.enrollments.map((e) => e.halaqaId) } } }),
  }))]);
  const surahs = await systemDb().quranSurah.findMany({ select: { id: true, nameArabic: true, nameEnglish: true } });
  const names = new Map(surahs.map((s) => [s.id, locale === "ar" ? s.nameArabic : s.nameEnglish]));
  const done = data.tasks.filter((x) => x.status === "DONE").length;
  const graded = data.scores.filter((x) => x.scorePercent !== null);
  const due = queue.filter((q) => q.nextReviewAt && q.nextReviewAt <= new Date()).length;

  return (
    <>
      <PageHeader title={t(`رحلتي مع القرآن: مرحباً بك، ${actor.name}`, `My Quran journey: welcome, ${actor.name}`)} subtitle={`${t(`المستوى ${data.student.level}`, `Level ${data.student.level}`)}${data.student.track ? ` · ${TRACK_LABELS[data.student.track]?.[locale === "ar" ? 0 : 1] ?? ""}` : ""}`} actions={<Link className="btn btn-ghost" href={lp("/student/map")}>{t("خريطة الحفظ", "Memorization map")}</Link>} />
      {!data.student.track && <Notice>{t("لم يعتمد مستواك بعد. ", "Your level is not confirmed yet. ")}<Link className="underline" href={lp("/student/placement")}>{t("ابدأ تحديد المستوى", "Start placement")}</Link></Notice>}
      <KpiGrid>
        <Kpi icon={ListChecks} label={t("ورد اليوم", "Today's program")} value={`${done} / ${data.tasks.length}`} />
        <Kpi icon={MapIcon} label={t("آيات متقنة", "Mastered ayahs")} value={data.mastered} hint={t("باعتماد المعلم", "Teacher-approved")} href={lp("/student/map")} />
        <Kpi icon={RefreshCcw} label={t("مراجعات مستحقة", "Revisions due")} value={due} />
        <Kpi icon={graded.length ? ClipboardCheck : Award} label={t("آخر الاختبارات", "Recent exams")} value={graded.length ? `${Math.round(graded.reduce((n, x) => n + x.scorePercent!, 0) / graded.length)}%` : "—"} hint={graded.length ? t(`متوسط آخر ${graded.length}`, `Average of last ${graded.length}`) : t("لا اختبارات بعد", "No exams yet")} href={lp("/student/assessments")} />
      </KpiGrid>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <Section title={t("ورد اليوم", "Today's program")} actions={data.plan && data.tasks.length === 0 ? <ActionButton path={`/students/${studentId}/days/generate`} body={{ date: today.toISOString() }} label={t("إنشاء برنامج مقترح", "Create suggested program")} variant="primary" /> : undefined}>
            {data.tasks.length > 0 && <div className="mb-3"><Progress label={t("إنجاز اليوم", "Today's completion")} value={completionPercent(data.tasks)} /></div>}
            {data.tasks.length === 0
              ? <Empty title={t("لا توجد مهام لهذا اليوم.", "No tasks for today.")} hint={data.plan ? t("يمكنك إنشاء البرنامج المقترح من خطتك.", "You can create the suggested program from your plan.") : t("سيضع لك معلمك خطتك بعد انضمامك إلى حلقة.", "Your teacher will set your plan once you join a halaqa.")} />
              : <TaskList tasks={data.tasks} surahNames={names} locale={locale} editable tomorrow={addDays(today, 1).toISOString()} />}
          </Section>
        </div>
        <div className="space-y-5">
          <Section title={t("حلقتي ومعلمي", "My halaqa")}>
            {data.enrollments.length === 0 ? <Empty title={t("لم تنضم إلى حلقة بعد.", "You have not joined a halaqa yet.")} action={<Link className="btn btn-primary btn-sm" href={lp("/student/halaqas")}>{t("استعرض الحلقات", "Browse halaqas")}</Link>} /> : (
              <ul className="space-y-1">{data.enrollments.map((e) => <li key={e.id}><strong>{e.halaqa.name}</strong><br /><span className="text-sm text-ink-2">{e.halaqa.teacher?.user.name ?? t("لم يحدد المعلم", "Teacher not set")}</span></li>)}</ul>
            )}
          </Section>
          <Section title={t("أولويات المراجعة", "Revision priorities")}>
            {queue.length === 0 ? <p className="text-sm text-ink-2">{t("تظهر بعد اعتماد الحفظ.", "Appear after memorization is approved.")}</p> : <ol className="space-y-1 text-sm">{queue.slice(0, 4).map((q) => <li key={q.id}><Link className="underline" href={lp(`/mushaf/surah/${q.surahId}?ayah=${q.fromAyah}`)}>{names.get(q.surahId)} ({q.fromAyah}–{q.toAyah})</Link></li>)}</ol>}
            <p className="mt-1 text-xs text-ink-2">{t("ترتيب مقترح، وقرار المعلم مقدم عليه.", "A suggested order; your teacher's decision comes first.")}</p>
          </Section>
          <Section title={t("حديث الحفظ", "Hadith to memorize")}>
            {extra.hadith.length === 0 ? <Link className="text-sm underline" href={lp("/hadith")}>{t("تصفح أكاديمية الحديث", "Browse the hadith academy")}</Link> : <ul className="text-sm">{extra.hadith.map((h) => <li key={h.id}><Link className="underline" href={lp(`/hadith/${h.hadith.collection.slug}/${h.hadith.number}`)}>{h.hadith.collection.titleAr}: {h.hadith.number}</Link></li>)}</ul>}
          </Section>
          {extra.notes.length > 0 && <Section title={t("ملاحظات المعلم", "Teacher notes")}><ul className="space-y-1 text-sm">{extra.notes.map((n) => <li key={n.id}>{n.note}</li>)}</ul></Section>}
          {extra.live > 0 && <Section title={t("الحصص المباشرة", "Live sessions")}><Link className="underline" href={lp("/live")}>{t(`حصص قادمة: ${extra.live}`, `Upcoming: ${extra.live}`)}</Link></Section>}
          <Section title={t("الحصص القادمة", "Upcoming sessions")}>
            {sessions.length === 0 ? <p className="text-sm text-ink-2">{t("لا توجد حصص مجدولة.", "No scheduled sessions.")}</p> : <ul className="space-y-1 text-sm">{sessions.map((s) => <li key={s.id}>{fmtDateTime(locale, s.startsAt)} — {s.halaqa.name}</li>)}</ul>}
          </Section>
          <Section title={t("الاختبارات والإنجازات", "Assessments and achievements")}>
            {data.pendingAssessments > 0 && <p className="text-sm"><Link className="underline" href={lp("/student/assessments")}>{t(`اختبارات متاحة: ${data.pendingAssessments}`, `Available assessments: ${data.pendingAssessments}`)}</Link></p>}
            {data.badges.length === 0 ? <p className="text-sm text-ink-2">{t("تظهر الشارات عند اعتماد معلمك لحفظك.", "Badges appear when your teacher approves your memorization.")}</p> : <ul className="mt-1 text-sm">{data.badges.map((b) => <li key={b.badgeId}>{locale === "ar" ? b.badge.nameAr : b.badge.nameEn}</li>)}</ul>}
          </Section>
        </div>
      </div>
    </>
  );
}
