import { notFound } from "next/navigation";
import { AttendanceForm } from "@/components/attendance-form";
import { Empty, PageHeader, Section } from "@/components/ui";
import { withActor } from "@/lib/db";
import { fmtDateTime } from "@/lib/i18n";
import { guard, pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "الحضور | Attendance", robots: { index: false } };

export default async function SessionPage({ params }: PageParams<{ id: string }>) {
  const { locale, t } = await pageCtx(params);
  const actor = await guard(locale, "attendance.record");
  const id = (await params).id;
  const s = await withActor(actor, (tx) => tx.halaqaSession.findUnique({
    where: { id },
    include: {
      attendance: true,
      halaqa: { select: { name: true, enrollments: { where: { status: "ACTIVE" }, select: { studentId: true, student: { select: { user: { select: { name: true } } } } } } } },
    },
  }));
  if (!s) notFound();
  const students = s.halaqa.enrollments.map((e) => ({ id: e.studentId, name: e.student.user.name, status: s.attendance.find((a) => a.studentId === e.studentId)?.status ?? null }));
  return (
    <>
      <PageHeader title={s.halaqa.name} subtitle={fmtDateTime(locale, s.startsAt)} />
      <Section title={t("تسجيل الحضور", "Record attendance")}>
        {students.length === 0 ? <Empty title={t("لا يوجد طلاب في الحلقة.", "No students in this halaqa.")} /> : <AttendanceForm sessionId={s.id} students={students} />}
      </Section>
    </>
  );
}
