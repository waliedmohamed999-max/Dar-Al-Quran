import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, Award, CalendarCheck, ClipboardCheck, FileCheck, GraduationCap, ListChecks, Mic, Scale, ShieldCheck, UserPlus, Users, UsersRound } from "lucide-react";
import { BarList, LineChart } from "@/components/dash/charts";
import { DataGrid } from "@/components/dash/data-grid";
import { ActionRow, Kpi, KpiGrid, Panel, SkeletonBlock } from "@/components/dash/kit";
import { Empty, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { guard, pageCtx, type PageParams, type SearchProps } from "@/lib/page";
import type { Actor } from "@/lib/session";
import type { Locale } from "@/lib/i18n";
import { adminOverview, adminQueues, parsePeriod, type Period } from "@/modules/reports/overview";
import { strugglingStudents } from "@/modules/reports/service";
import { TRACK_LABELS } from "@/modules/unified/labels";

export const metadata = { title: "لوحة المعلومات | Dashboard", robots: { index: false } };

async function Overview({ actor, period, locale, t, lp }: { actor: Actor; period: Period; locale: Locale; t: (a: string, b: string) => string; lp: (p: string) => string }) {
  const [d, q] = await Promise.all([adminOverview(actor, period), adminQueues(actor)]);
  const canReports = actor.perms.has("students.view_all");
  const isSupervisor = actor.roles.some((r) => r.key === "supervisor") && !actor.roles.some((r) => r.key === "admin" || r.key === "super_admin");
  const alerts = isSupervisor ? await strugglingStudents(actor) : [];
  const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
  const i = locale === "ar" ? 0 : 1;
  const rows = d.halaqas_.map((h) => ({
    id: h.id, text: `${h.name} ${h.teacher ?? ""}`, filter: h.active ? "active" : "inactive",
    sort: { name: h.name, teacher: h.teacher, members: h.members, attendance: h.attendance, tasks: h.tasks },
    cells: {
      name: <span className="font-semibold">{h.name}</span>, teacher: h.teacher ?? <span className="text-ink-2">{t("لم يسند", "Unassigned")}</span>, members: `${h.members} / ${h.capacity}`, attendance: pct(h.attendance), tasks: pct(h.tasks),
      status: <StatusBadge locale={locale} status={h.active ? "ACTIVE" : "INACTIVE"} />,
      actions: actor.perms.has("halaqas.manage") ? <Link className="btn btn-ghost btn-sm" href={lp("/admin/halaqas")}>{t("إدارة", "Manage")}</Link> : null,
    },
  }));
  const urgentTotal = d.pendingEnroll + d.pendingRecitations + d.ungraded + d.pendingPlacement + d.pendingCerts + (q.scholarly ?? 0) + (q.appeals ?? 0) + (q.judging ?? 0) + (q.failedJobs ?? 0);
  return (
    <>
      {(q.failedJobs ?? 0) > 0 && <Notice tone="danger">{t(`توجد ${q.failedJobs} مهام خلفية فاشلة. قد تتأخر الرسائل والتذكيرات.`, `${q.failedJobs} background jobs failed. Messages and reminders may be delayed.`)}</Notice>}
      <KpiGrid>
        <Kpi icon={GraduationCap} label={t("إجمالي الطلاب", "Total students")} value={d.students} />
        <Kpi icon={UsersRound} label={t("المعلمون النشطون", "Active teachers")} value={d.teachers} />
        <Kpi icon={Users} label={t("الحلقات النشطة", "Active halaqas")} value={d.halaqas} href={lp("/admin/halaqas")} />
        <Kpi icon={CalendarCheck} label={t("نسبة الحضور", "Attendance")} value={pct(d.attendancePercent)} hint={t("في الفترة المحددة", "In the selected period")} />
        <Kpi icon={ListChecks} label={t("إنجاز الأوراد", "Task completion")} value={pct(d.tasksPercent)} hint={t("في الفترة المحددة", "In the selected period")} />
        <Kpi icon={Mic} label={t("تسميعات منتظرة", "Recitations waiting")} value={d.pendingRecitations} />
        <Kpi icon={UserPlus} label={t("طلبات الانتساب", "Enrollment requests")} value={d.pendingEnroll} href={actor.perms.has("halaqas.manage") ? lp("/admin/halaqas") : undefined} />
        <Kpi icon={Award} label={t("الشهادات المعتمدة", "Certificates issued")} value={d.certs} />
      </KpiGrid>
      <div className="mb-5 grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-1" title={t("مهام تحتاج إجراء", "Tasks needing action")} hint={urgentTotal ? t(`${urgentTotal} بانتظار قرار`, `${urgentTotal} waiting for a decision`) : t("لا شيء ينتظر الآن.", "Nothing is waiting right now.")}>
          <ul className="space-y-0.5">
            {actor.perms.has("halaqas.manage") && <ActionRow icon={UserPlus} href={lp("/admin/halaqas")} label={t("طلبات الانتساب", "Enrollment requests")} count={d.pendingEnroll} />}
            <ActionRow icon={Mic} href={lp("/teacher/reviews")} label={t("التسميعات المنتظرة", "Recitations waiting")} count={d.pendingRecitations} />
            {canReports && <ActionRow icon={Scale} href={lp("/teacher/placement")} label={t("تقييمات مستوى", "Placement reviews")} count={d.pendingPlacement} />}
            <ActionRow icon={ClipboardCheck} href={lp(actor.teacherId ? "/teacher/assessments" : "/admin/competitions")} label={t("اختبارات تنتظر التصحيح", "Exams awaiting grading")} count={d.ungraded} />
            {q.judging !== null && <ActionRow icon={ClipboardCheck} href={lp("/admin/judging")} label={t("نتائج تحكيم تنتظر اعتماداً", "Judging results awaiting approval")} count={q.judging} />}
            {q.appeals !== null && <ActionRow icon={FileCheck} href={lp("/admin/competitions")} label={t("اعتراضات", "Appeals")} count={q.appeals} />}
            {q.scholarly !== null && <ActionRow icon={ShieldCheck} href={lp("/admin/scholarly")} label={t("محتوى ينتظر مراجعة علمية", "Content awaiting scholarly review")} count={q.scholarly} />}
            {actor.perms.has("certificates.request") && <ActionRow icon={Award} href={lp("/admin/certificates")} label={t("شهادات تنتظر الموافقة", "Certificates awaiting approval")} count={d.pendingCerts} />}
            {q.failedJobs !== null && <ActionRow icon={AlertTriangle} href={lp("/admin/settings")} label={t("مشكلات التشغيل", "Operational problems")} count={q.failedJobs} />}
          </ul>
        </Panel>
        <Panel className="xl:col-span-2" title={t("اتجاه حضور الطلاب", "Attendance trend")} hint={t("نسبة الحاضرين من المسجل حضورهم", "Share present of recorded attendance")}>
          <LineChart label={t("اتجاه حضور الطلاب", "Attendance trend")} unit="%" max={100} series={[{ name: t("الحضور", "Attendance"), color: "var(--chart-1)", points: d.trend }]} emptyText={t("لم يسجل حضور في هذه الفترة.", "No attendance was recorded in this period.")} />
        </Panel>
      </div>
      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <Panel title={t("إنجاز المهام", "Task completion")}><LineChart label={t("إنجاز المهام", "Task completion")} unit="%" max={100} series={[{ name: t("الإنجاز", "Completion"), color: "var(--chart-1)", points: d.taskTrend }]} emptyText={t("لا توجد مهام في هذه الفترة.", "No tasks in this period.")} /></Panel>
        <Panel title={t("تقدم الحفظ والمراجعة", "Memorization and revision")} hint={t("تسميعات معتمدة ومراجعات مقيمة", "Approved recitations and graded revisions")}><LineChart label={t("تقدم الحفظ والمراجعة", "Memorization and revision")} series={[{ name: t("تسميع معتمد", "Approved recitations"), color: "var(--chart-1)", points: d.memo }, { name: t("مراجعة مقيمة", "Graded revisions"), color: "var(--chart-2)", points: d.rev }]} emptyText={t("لا توجد سجلات في هذه الفترة.", "No records in this period.")} /></Panel>
        <Panel title={t("توزيع الطلاب حسب المسار", "Students by track")} hint={t("المسار الذي اعتمده المعلم", "The track a teacher confirmed")}><BarList label={t("توزيع الطلاب", "Students by track")} rows={d.tracks.map((x) => ({ label: x.track ? TRACK_LABELS[x.track]?.[i] ?? x.track : t("لم يحدد بعد", "Not set yet"), value: x.count }))} emptyText={t("لا يوجد طلاب.", "No students.")} /></Panel>
        <Panel title={t("نشاط الحلقات", "Halaqa activity")} hint={t("عدد الحصص غير الملغاة", "Sessions not cancelled")}><LineChart label={t("نشاط الحلقات", "Halaqa activity")} series={[{ name: t("الحصص", "Sessions"), color: "var(--chart-1)", points: d.activity }]} emptyText={t("لا توجد حصص في هذه الفترة.", "No sessions in this period.")} /></Panel>
      </div>
      {isSupervisor && (
        <div className="mb-5"><Panel title={t("متابعة تعليمية: طلاب يحتاجون دعماً", "Follow-up: students who may need support")}>
          {alerts.length === 0 ? <Empty title={t("لا توجد تنبيهات.", "No alerts.")} /> : <ul className="grid gap-1 text-sm sm:grid-cols-2">{alerts.map((a) => <li key={a.studentId}><Link className="underline" href={lp(`/reports/${a.studentId}`)}>{a.name}</Link> <span className="text-ink-2">({t(`غياب ${a.absent}`, `absent ${a.absent}`)})</span></li>)}</ul>}
        </Panel></div>
      )}
      <Panel title={t("الحلقات", "Halaqas")}>
        <DataGrid caption={t("الحلقات", "Halaqas")} emptyText={t("لا توجد حلقات.", "No halaqas.")} filterLabel={t("الحالة", "Status")} filterOptions={[{ value: "active", label: t("نشطة", "Active") }, { value: "inactive", label: t("غير نشطة", "Inactive") }]} rows={rows} columns={[
          { key: "name", label: t("الحلقة", "Halaqa"), sortable: true }, { key: "teacher", label: t("المعلم", "Teacher"), sortable: true }, { key: "members", label: t("الطلاب", "Students"), sortable: true },
          { key: "attendance", label: t("الحضور", "Attendance"), sortable: true }, { key: "tasks", label: t("إنجاز الورد", "Task completion"), sortable: true }, { key: "status", label: t("الحالة", "Status") }, { key: "actions", label: t("إجراءات", "Actions") },
        ]} />
      </Panel>
    </>
  );
}

const Loading = () => (
  <div aria-busy="true"><div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 8 }, (_, k) => <SkeletonBlock key={k} h="h-24" />)}</div><div className="grid gap-4 xl:grid-cols-3"><SkeletonBlock h="h-72" /><div className="xl:col-span-2"><SkeletonBlock h="h-72" /></div></div></div>
);

export default async function AdminHome({ params, searchParams }: PageParams & SearchProps) {
  const { locale, t, lp } = await pageCtx(params);
  const actor = await guard(locale, "reports.view");
  const sp = await searchParams;
  const period = parsePeriod(sp);
  const tab = (key: string, label: string) => <Link className={`btn btn-sm ${period.key === key ? "btn-primary" : "btn-ghost"}`} aria-current={period.key === key ? "true" : undefined} href={lp(`/admin?period=${key}`)}>{label}</Link>;
  return (
    <>
      <PageHeader title={t("لوحة المعلومات", "Dashboard")} subtitle={t("كل الأرقام محسوبة من سجلات النظام.", "Every figure is computed from system records.")} actions={
        <div className="flex flex-wrap items-end gap-2">
          {tab("week", t("أسبوع", "Week"))}{tab("month", t("شهر", "Month"))}
          <form method="get" className="flex flex-wrap items-end gap-1.5">
            <input type="hidden" name="period" value="custom" />
            <div><label className="label" htmlFor="p-from">{t("من", "From")}</label><input id="p-from" name="from" type="date" dir="ltr" required className="input !min-h-[34px] !py-0.5" defaultValue={period.key === "custom" ? period.from.toISOString().slice(0, 10) : undefined} /></div>
            <div><label className="label" htmlFor="p-to">{t("إلى", "To")}</label><input id="p-to" name="to" type="date" dir="ltr" required className="input !min-h-[34px] !py-0.5" defaultValue={period.key === "custom" ? period.to.toISOString().slice(0, 10) : undefined} /></div>
            <button className="btn btn-ghost btn-sm">{t("تطبيق", "Apply")}</button>
          </form>
        </div>
      } />
      <Suspense fallback={<Loading />} key={`${period.from.getTime()}`}>
        <Overview actor={actor} period={period} locale={locale} t={t} lp={lp} />
      </Suspense>
    </>
  );
}
