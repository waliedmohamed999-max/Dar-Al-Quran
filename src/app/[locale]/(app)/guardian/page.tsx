import Link from "next/link";
import { notFound } from "next/navigation";
import { BellRing, CalendarCheck, CalendarX, ListChecks, RefreshCcw, Sparkles } from "lucide-react";
import { ActionForm } from "@/components/client";
import { Kpi, Panel } from "@/components/dash/kit";
import { Empty, PageHeader, StatusBadge } from "@/components/ui";
import { withActor } from "@/lib/db";
import { fmtDate } from "@/lib/i18n";
import { guard, pageCtx, type PageParams } from "@/lib/page";
import { childSummaries } from "@/modules/reports/overview";

export const metadata = { title: "ولي الأمر | Guardian", robots: { index: false } };

export default async function GuardianHome({ params }: PageParams) {
  const { locale, t, lp } = await pageCtx(params);
  const actor = await guard(locale);
  const guardianId = actor.guardianId;
  if (!guardianId) notFound();
  const { links, unread } = await withActor(actor, async (tx) => ({
    links: await tx.guardianStudentLink.findMany({ where: { guardianId }, include: { student: { include: { user: { select: { name: true } } } } } }),
    unread: await tx.notification.count({ where: { userId: actor.id, readAt: null } }),
  }));
  const approved = links.filter((l) => l.status === "APPROVED");
  const summaries = new Map((await childSummaries(actor, approved.map((l) => l.studentId))).map((s) => [s.id, s]));
  return (
    <>
      <PageHeader title={t("أبنائي", "My children")} subtitle={t("تعرض بيانات الطلاب المعتمد ربطهم بحسابك فقط.", "Only students officially linked to your account are shown.")} actions={<Link className="btn btn-ghost" href={lp("/notifications")}><BellRing className="size-4" aria-hidden="true" />{t(`الإشعارات (${unread})`, `Notifications (${unread})`)}</Link>} />
      {links.length === 0 && <div className="mb-5"><Empty title={t("لم يربط أي طالب بحسابك بعد.", "No students are linked to your account yet.")} /></div>}
      <div className="mb-5 space-y-4">
        {approved.map((l) => {
          const s = summaries.get(l.studentId)!;
          return (
            <Panel key={l.id} title={l.student.user.name} actions={<Link className="btn btn-primary btn-sm" href={lp(`/guardian/students/${l.studentId}`)}>{t("التفاصيل", "Details")}</Link>}>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi icon={Sparkles} label={t("آيات متقنة", "Mastered ayahs")} value={s.mastered} hint={t("باعتماد المعلم", "Teacher-approved")} />
                <Kpi icon={CalendarCheck} label={t("الحضور (30 يوماً)", "Attendance (30 days)")} value={s.attendance === null ? "—" : `${s.attendance}%`} />
                <Kpi icon={CalendarX} label={t("الغياب (30 يوماً)", "Absences (30 days)")} value={s.absent} />
                <Kpi icon={ListChecks} label={t("واجبات مفتوحة", "Open assignments")} value={s.tasks} hint={t(`مراجعات مستحقة: ${s.due}`, `Revisions due: ${s.due}`)} />
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-sm"><RefreshCcw className="mt-0.5 size-4 flex-none text-ink-2" aria-hidden="true" /><p><strong>{t("آخر ملاحظة من المعلم", "Latest teacher note")}: </strong>{s.note ?? t("لا توجد ملاحظات بعد.", "No notes yet.")}{s.noteAt && <span className="ms-1 text-xs text-ink-2">({fmtDate(locale, s.noteAt)})</span>}</p></div>
            </Panel>
          );
        })}
        {links.filter((l) => l.status !== "APPROVED").map((l) => <div key={l.id} className="card flex flex-wrap items-center justify-between gap-2"><span className="text-ink-2">{t("طلب ربط قيد المراجعة", "Link request under review")}</span><StatusBadge locale={locale} status={l.status} /></div>)}
      </div>
      <Panel title={t("طلب ربط طالب", "Request a student link")}>
        <p className="mb-3 text-sm text-ink-2">{t("تتحقق الإدارة رسمياً من صلتك بالطالب قبل الاعتماد، ولن تظهر أي بيانات قبل ذلك.", "The administration verifies your relationship before approval. No data appears before that.")}</p>
        <ActionForm path="/guardian/links" submit={t("إرسال الطلب", "Send request")} success={t("أرسل الطلب، وستراجعه الإدارة إذا طابقت البيانات.", "Sent. The administration will review it if the details match.")} fields={[
          { name: "studentEmail", label: t("بريد حساب الطالب", "Student's account email"), type: "email", required: true },
          { name: "relation", label: t("صلة القرابة", "Relationship"), required: true },
        ]} />
      </Panel>
    </>
  );
}
