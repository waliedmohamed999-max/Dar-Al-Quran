import Link from "next/link";
import { Empty, PageHeader, Section, Table } from "@/components/ui";
import { withActor } from "@/lib/db";
import { guard, pageCtx, type PageParams } from "@/lib/page";
import { studentProgress } from "@/modules/learning/service";

export const metadata = { title: "تقارير الطلاب | Student reports", robots: { index: false } };

export default async function TeacherReport({ params }: PageParams) {
  const { locale, t, lp } = await pageCtx(params);
  const actor = await guard(locale, "reports.view");
  const students = await withActor(actor, (tx) => tx.student.findMany({ where: actor.teacherId ? { enrollments: { some: { status: "ACTIVE", halaqa: { teacherId: actor.teacherId } } } } : {}, take: 200, select: { id: true, level: true, user: { select: { name: true } } } }));
  const rows = await Promise.all(students.map(async (s) => ({ s, p: await studentProgress(actor, s.id) })));
  const v = (n: number | null, suffix = "") => (n === null ? "—" : `${n}${suffix}`);
  return (
    <>
      <PageHeader title={t("تقارير مستوى الطلاب", "Student level reports")} />
      <Section title={t("الطلاب", "Students")}>
        {rows.length === 0 ? <Empty title={t("لا يوجد طلاب.", "No students.")} /> : (
          <Table caption={t("تقرير الطلاب", "Student report")} columns={[t("الطالب", "Student"), t("الآيات المعتمدة", "Approved ayahs"), t("إتقان المراجعة", "Revision"), t("الحضور", "Attendance"), t("المهام", "Tasks")]}>
            {rows.map(({ s, p }) => <tr key={s.id}><td><Link className="underline" href={lp(`/teacher/students/${s.id}`)}>{s.user.name}</Link></td><td>{p.ayahsApproved}</td><td>{v(p.revisionMastery, " / 5")}</td><td>{v(p.attendancePercent, "%")}</td><td>{v(p.tasksDonePercent, "%")}</td></tr>)}
          </Table>
        )}
      </Section>
    </>
  );
}
