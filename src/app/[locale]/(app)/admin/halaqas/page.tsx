import { ActionButton, ActionForm } from "@/components/client";
import { Empty, PageHeader, Section, StatusBadge, Table } from "@/components/ui";
import { withActor } from "@/lib/db";
import { fmtDateTime, label, WEEKDAYS } from "@/lib/i18n";
import { guard, pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "الحلقات | Halaqas", robots: { index: false } };
const time = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export default async function AdminHalaqas({ params }: PageParams) {
  const { locale, t } = await pageCtx(params);
  const actor = await guard(locale, "halaqas.manage");
  const { halaqas, teachers, pending, sessions } = await withActor(actor, async (tx) => ({
    halaqas: await tx.halaqa.findMany({ include: { teacher: { include: { user: { select: { name: true } } } }, schedule: true, _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } }, orderBy: { name: "asc" } }),
    teachers: await tx.teacher.findMany({ include: { user: { select: { name: true } } } }),
    pending: await tx.enrollment.findMany({ where: { status: { in: ["PENDING", "WAITLISTED"] } }, orderBy: { createdAt: "asc" }, include: { student: { include: { user: { select: { name: true } } } }, halaqa: { select: { name: true } } } }),
    sessions: await tx.halaqaSession.findMany({ where: { startsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" }, take: 15, include: { halaqa: { select: { name: true } }, substitute: { include: { user: { select: { name: true } } } } } }),
  }));
  const tOpts = teachers.map((x) => ({ value: x.id, label: x.user.name }));
  return (
    <>
      <PageHeader title={t("إدارة الحلقات", "Manage halaqas")} />
      <Section title={t("طلبات الانتساب وقائمة الانتظار", "Enrollment requests and waiting list")}>
        {pending.length === 0 ? <Empty title={t("لا توجد طلبات.", "No requests.")} /> : (
          <Table caption={t("طلبات الانتساب", "Enrollment requests")} columns={[t("الطالب", "Student"), t("الحلقة", "Halaqa"), t("الحالة", "Status"), t("قرار", "Decision")]}>
            {pending.map((e) => (
              <tr key={e.id}>
                <td>{e.student.user.name}</td><td>{e.halaqa.name}</td><td><StatusBadge locale={locale} status={e.status} /></td>
                <td className="flex flex-wrap gap-2">
                  <ActionButton path={`/enrollments/${e.id}/decide`} body={{ approve: true }} label={t("قبول", "Approve")} variant="primary" />
                  <ActionButton path={`/enrollments/${e.id}/decide`} body={{ approve: false }} label={t("رفض", "Reject")} />
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
      <Section title={t("حلقة جديدة", "New halaqa")}>
        <ActionForm path="/halaqas" submit={t("إنشاء", "Create")} transform="halaqa" fields={[
            { name: "name", label: t("الاسم", "Name"), required: true },
            { name: "teacherId", label: t("المعلم", "Teacher"), type: "select", options: tOpts },
            { name: "ageGroup", label: t("الفئة العمرية", "Age group") },
            { name: "level", label: t("المستوى", "Level"), type: "number", min: 1, max: 10, defaultValue: 1, required: true },
            { name: "capacity", label: t("السعة", "Capacity"), type: "number", min: 1, max: 200, defaultValue: 12, required: true },
            { name: "gender", label: t("التنظيم", "Grouping"), type: "select", required: true, defaultValue: "ANY", options: [["ANY", "عام", "Any"], ["MALE", "بنين", "Boys or men"], ["FEMALE", "بنات", "Girls or women"]].map(([value, ar, en]) => ({ value, label: t(ar, en) })) },
            { name: "mode", label: t("النمط", "Mode"), type: "select", required: true, options: ["IN_PERSON", "REMOTE", "HYBRID"].map((value) => ({ value, label: label(locale, value) })) },
            { name: "meetingUrl", label: t("رابط الاجتماع (https)", "Meeting link (https)"), type: "url", hint: t("يحفظ مشفراً ويظهر لأعضاء الحلقة فقط.", "Stored encrypted and shown to members only.") },
            { name: "location", label: t("المكان", "Location") },
            { name: "weekday", label: t("اليوم", "Day"), type: "select", required: true, options: WEEKDAYS[locale].map((d, i) => ({ value: String(i), label: d })) },
            { name: "start", label: t("من", "From"), type: "time", required: true },
            { name: "end", label: t("إلى", "To"), type: "time", required: true },
          ]} />
      </Section>
      <Section title={t("الحلقات", "Halaqas")}>
        {halaqas.length === 0 ? <Empty title={t("لا توجد حلقات.", "No halaqas.")} /> : (
          <Table caption={t("الحلقات", "Halaqas")} columns={[t("الاسم", "Name"), t("المعلم", "Teacher"), t("الأعضاء", "Members"), t("المواعيد", "Schedule"), t("إجراءات", "Actions")]}>
            {halaqas.map((h) => (
              <tr key={h.id}>
                <td>{h.name}</td><td>{h.teacher?.user.name ?? "—"}</td><td>{h._count.enrollments}/{h.capacity}</td>
                <td>{h.schedule.map((s) => <div key={s.id} className="whitespace-nowrap">{WEEKDAYS[locale][s.weekday]} {time(s.startMin)}</div>)}</td>
                <td><ActionButton path={`/halaqas/${h.id}/sessions/generate`} body={{ weeks: 4 }} label={t("توليد حصص 4 أسابيع", "Generate 4 weeks")} success={t("تم", "Done")} /></td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
      <Section title={t("الحصص القادمة واستبدال المعلم", "Upcoming sessions and substitutes")}>
        {sessions.length === 0 ? <Empty title={t("لا توجد حصص.", "No sessions.")} /> : (
          <ul className="space-y-3">
            {sessions.map((s) => (
              <li key={s.id} className="border-b border-line pb-3">
                <p className="mb-1 font-semibold">{fmtDateTime(locale, s.startsAt)} — {s.halaqa.name}{s.substitute && <span className="text-sm font-normal"> ({t("البديل", "Substitute")}: {s.substitute.user.name})</span>}</p>
                <ActionForm path={`/sessions/${s.id}/substitute`} method="PUT" submit={t("حفظ البديل", "Save substitute")} transform="substitute" fields={[{ name: "teacherId", label: t("المعلم البديل", "Substitute teacher"), type: "select", options: tOpts }]} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
