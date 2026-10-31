import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton, ActionForm } from "@/components/client";
import { ProgressView } from "@/components/progress-view";
import { Empty, Notice, PageHeader, Section, StatusBadge, Table } from "@/components/ui";
import { systemDb, withActor } from "@/lib/db";
import { fmtDateTime, TASK_TYPES } from "@/lib/i18n";
import { guard, pageCtx, type PageParams } from "@/lib/page";
import { studentProgress } from "@/modules/learning/service";
import { dayOnly } from "@/modules/learning/srs";

export const metadata = { title: "متابعة الطالب | Student", robots: { index: false } };

export default async function GuardianStudent({ params }: PageParams<{ id: string }>) {
  const { locale, t, lp } = await pageCtx(params);
  const actor = await guard(locale);
  const studentId = (await params).id;
  if (!actor.guardianId) notFound();
  // RLS grants nothing unless an approved link exists, so an unknown id yields null and a 404.
  const data = await withActor(actor, async (tx) => {
    const student = await tx.student.findUnique({ where: { id: studentId }, include: { user: { select: { name: true } } } });
    if (!student) return null;
    return {
      student,
      tasks: await tx.dailyTask.findMany({ where: { studentId, date: dayOnly(new Date()), status: { not: "CARRIED_OVER" } }, orderBy: { sortOrder: "asc" } }),
      attendance: await tx.attendance.findMany({ where: { studentId }, orderBy: { recordedAt: "desc" }, take: 10, include: { session: { select: { startsAt: true } } } }),
      enrollments: await tx.enrollment.findMany({ where: { studentId, status: "ACTIVE" }, include: { halaqa: { include: { teacher: { include: { user: { select: { id: true, name: true } } } } } } } }),
    };
  });
  if (!data) notFound();
  const sessions = await withActor(actor, (tx) => tx.halaqaSession.findMany({ where: { halaqaId: { in: data.enrollments.map((e) => e.halaqaId) }, startsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" }, take: 5, include: { halaqa: { select: { name: true } } } }));
  const progress = await studentProgress(actor, studentId);
  const surahs = await systemDb().quranSurah.findMany({ select: { id: true, nameArabic: true, nameEnglish: true } });
  const nm = (id: number | null) => { const s = surahs.find((x) => x.id === id); return s ? (locale === "ar" ? s.nameArabic : s.nameEnglish) : ""; };
  const teachers = data.enrollments.map((e) => e.halaqa.teacher?.user).filter(Boolean) as { id: string; name: string }[];

  return (
    <>
      <PageHeader title={data.student.user.name} actions={<Link className="btn btn-ghost" href={lp(`/reports/${studentId}`)}>{t("التقارير", "Reports")}</Link>} />
      <ProgressView p={progress} locale={locale} />
      {data.student.isMinor && (
        <Section title={t("موافقة التسجيلات الصوتية", "Recording consent")}>
          {data.student.recordingConsentAt
            ? <><Notice>{t("الموافقة مفعلة ويمكن للطالب إرسال تسجيلاته إلى معلمه.", "Consent is active; the student can send recordings to their teacher.")}</Notice><ActionButton path={`/guardian/students/${studentId}/consent`} method="PUT" body={{ granted: false }} label={t("سحب الموافقة", "Withdraw consent")} variant="danger" /></>
            : <><p className="mb-2 text-sm">{t("تحفظ التسجيلات خاصة ولا يصل إليها إلا الطالب ومعلمه ومن تخوله الصلاحيات، وتحذف بعد مدة الاحتفاظ.", "Recordings stay private to the student, their teacher and authorized staff, and are deleted after the retention period.")}</p><ActionButton path={`/guardian/students/${studentId}/consent`} method="PUT" body={{ granted: true }} label={t("أوافق على إرسال التسجيلات", "I consent to recordings")} variant="primary" /></>}
        </Section>
      )}
      {data.student.isMinor && (
        <Section title={t("موافقة استخدام المساعد الذكي", "Assistant consent")}>
          <p className="mb-2 text-sm">{t("يجيب المساعد من مصادر مراجعة، وترسل أسئلة الطالب إلى مزود الذكاء الاصطناعي دون اسمه.", "The assistant answers from reviewed sources. The student's questions go to the AI provider without their name.")}</p>
          <ActionButton path={`/guardian/students/${studentId}/ai-consent`} method="PUT" body={{ granted: !data.student.aiConsentAt }} label={data.student.aiConsentAt ? t("سحب الموافقة", "Withdraw consent") : t("أوافق", "I consent")} variant={data.student.aiConsentAt ? "danger" : "primary"} />
        </Section>
      )}
      <Section title={t("مهام اليوم", "Today's tasks")}>
        {data.tasks.length === 0 ? <Empty title={t("لا توجد مهام اليوم.", "No tasks today.")} /> : (
          <ul className="space-y-1">{data.tasks.map((x) => <li key={x.id} className="flex flex-wrap items-center gap-2">{TASK_TYPES[x.type][locale]} {x.surahId ? `— ${nm(x.surahId)} (${x.fromAyah}–${x.toAyah})` : ""} <StatusBadge locale={locale} status={x.status} /></li>)}</ul>
        )}
      </Section>
      <Section title={t("الجدول", "Schedule")}>
        {sessions.length === 0 ? <Empty title={t("لا توجد حصص قادمة.", "No upcoming sessions.")} /> : <ul className="text-sm">{sessions.map((s) => <li key={s.id}>{fmtDateTime(locale, s.startsAt)} — {s.halaqa.name}</li>)}</ul>}
      </Section>
      <Section title={t("الحضور", "Attendance")}>
        {data.attendance.length === 0 ? <Empty title={t("لا توجد سجلات حضور.", "No attendance records.")} /> : (
          <Table caption={t("سجل الحضور", "Attendance record")} columns={[t("الموعد", "Time"), t("الحالة", "Status")]}>
            {data.attendance.map((a) => <tr key={a.id}><td>{fmtDateTime(locale, a.session.startsAt)}</td><td><StatusBadge locale={locale} status={a.status} /></td></tr>)}
          </Table>
        )}
      </Section>
      <Section title={t("مراسلة المعلم", "Message the teacher")}>
        {teachers.length === 0 ? <Empty title={t("لا يوجد معلم مسند حالياً.", "No teacher assigned right now.")} /> : (
          <ActionForm path="/messages" submit={t("إرسال", "Send")} success={t("أرسلت رسالتك.", "Message sent.")} fields={[
            { name: "studentId", label: "", type: "hidden", defaultValue: studentId },
            { name: "recipientId", label: t("المعلم", "Teacher"), type: "select", required: true, options: teachers.map((x) => ({ value: x.id, label: x.name })) },
            { name: "body", label: t("الرسالة", "Message"), type: "textarea", required: true },
          ]} />
        )}
      </Section>
    </>
  );
}
