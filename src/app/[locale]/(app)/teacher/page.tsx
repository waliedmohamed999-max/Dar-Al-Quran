import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ListChecks, Mic, UsersRound } from "lucide-react";
import { Kpi, KpiGrid } from "@/components/dash/kit";
import { Empty, Notice, PageHeader, Section, StatusBadge, Table } from "@/components/ui";
import { withActor } from "@/lib/db";
import { fmtDateTime, label } from "@/lib/i18n";
import { guard, pageCtx, type PageParams } from "@/lib/page";
import { strugglingStudents } from "@/modules/reports/service";

export const metadata = { title: "لوحة المعلم | Teacher", robots: { index: false } };

export default async function TeacherHome({ params }: PageParams) {
  const { locale, t, lp } = await pageCtx(params);
  const actor = await guard(locale);
  const teacherId = actor.teacherId;
  if (!teacherId) notFound();
  const { halaqas, sessions, pending } = await withActor(actor, async (tx) => ({
    halaqas: await tx.halaqa.findMany({ where: { teacherId }, include: { enrollments: { where: { status: "ACTIVE" }, include: { student: { include: { user: { select: { name: true } } } } } } } }),
    sessions: await tx.halaqaSession.findMany({
      where: { startsAt: { gte: new Date(Date.now() - 7 * 86400000) }, OR: [{ halaqa: { teacherId } }, { substituteTeacherId: teacherId }] },
      orderBy: { startsAt: "asc" }, take: 10, include: { halaqa: { select: { name: true } } },
    }),
    pending: await tx.recitationSubmission.count({ where: { status: "SUBMITTED" } }),
  }));
  const alerts = await strugglingStudents(actor);
  const studentIds = halaqas.flatMap((h) => h.enrollments.map((e) => e.studentId));
  const today = new Date(new Date().toISOString().slice(0, 10));
  const openTasks = await withActor(actor, (tx) => tx.dailyTask.count({ where: { studentId: { in: studentIds }, date: today, status: { in: ["PENDING", "IN_PROGRESS"] } } }));
  const todaySessions = sessions.filter((s) => s.startsAt.toDateString() === new Date().toDateString()).length;
  return (
    <>
      <PageHeader title={t("لوحة المعلم", "Teacher dashboard")} actions={<Link className="btn btn-primary" href={lp("/teacher/reviews")}>{t(`تسميع بانتظار التقييم: ${pending}`, `Recitations to review: ${pending}`)}</Link>} />
      <KpiGrid>
        <Kpi icon={UsersRound} label={t("طلابي", "My students")} value={studentIds.length} hint={t(`في ${halaqas.length} حلقات`, `In ${halaqas.length} halaqas`)} />
        <Kpi icon={Mic} label={t("تسميعات بانتظار التقييم", "Recitations to review")} value={pending} href={lp("/teacher/reviews")} />
        <Kpi icon={ListChecks} label={t("مهام اليوم المفتوحة", "Open tasks today")} value={openTasks} href={lp("/teacher/assign")} />
        <Kpi icon={CalendarDays} label={t("حصص اليوم", "Sessions today")} value={todaySessions} />
      </KpiGrid>
      {alerts.length > 0 && (
        <Notice tone="warn">
          <strong>{t("طلاب يحتاجون إلى دعم", "Students who may need support")}: </strong>
          {alerts.map((a, i) => <span key={a.studentId}>{i > 0 && "، "}<Link className="underline" href={lp(`/teacher/students/${a.studentId}`)}>{a.name}</Link> ({t(`غياب ${a.absent}، مهام مفتوحة ${a.open}`, `${a.absent} absences, ${a.open} open tasks`)})</span>)}
        </Notice>
      )}
      {halaqas.length === 0 && <Empty title={t("لم تسند إليك حلقات بعد.", "No halaqas assigned yet.")} />}
      {halaqas.map((h) => (
        <Section key={h.id} title={h.name} actions={<span className="text-sm text-ink-2">{label(locale, h.mode)} · {h.enrollments.length}/{h.capacity}</span>}>
          {h.enrollments.length === 0 ? <Empty title={t("لا يوجد طلاب في الحلقة.", "No students in this halaqa.")} /> : (
            <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {h.enrollments.map((e) => <li key={e.id}><Link className="underline" href={lp(`/teacher/students/${e.studentId}`)}>{e.student.user.name}</Link></li>)}
            </ul>
          )}
        </Section>
      ))}
      <Section title={t("الجدول", "Schedule")}>
        {sessions.length === 0 ? <Empty title={t("لا توجد حصص مجدولة.", "No scheduled sessions.")} /> : (
          <Table caption={t("الحصص", "Sessions")} columns={[t("الموعد", "Time"), t("الحلقة", "Halaqa"), t("الحالة", "Status"), ""]}>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td>{fmtDateTime(locale, s.startsAt)}</td><td>{s.halaqa.name}{s.substituteTeacherId === teacherId && ` (${t("بديل", "Substitute")})`}</td>
                <td><StatusBadge locale={locale} status={s.status} /></td>
                <td><Link className="underline" href={lp(`/teacher/sessions/${s.id}`)}>{t("الحضور", "Attendance")}</Link></td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </>
  );
}
