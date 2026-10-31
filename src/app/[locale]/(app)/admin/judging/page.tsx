import Link from "next/link";
import { ActionForm } from "@/components/client";
import { Empty, PageHeader, Section, StatusBadge, Table } from "@/components/ui";
import { systemDb } from "@/lib/db";
import { fmtDateTime } from "@/lib/i18n";
import { guard, pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "التحكيم الشفهي | Oral judging", robots: { index: false } };

export default async function AdminJudging({ params }: PageParams) {
  const { locale, t, lp } = await pageCtx(params);
  await guard(locale, "assessments.manage");
  const db = systemDb();
  const [rubrics, competitions, judges, sessions] = await Promise.all([
    db.rubric.findMany({ orderBy: { createdAt: "desc" }, include: { criteria: { orderBy: { sortOrder: "asc" } } } }),
    db.competition.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, title: true } }),
    db.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { permissions: { some: { permission: { key: "reviews.write" } } } } } } }, select: { id: true, name: true } }),
    db.judgingSession.findMany({ orderBy: { scheduledAt: "desc" }, include: { competition: { select: { title: true } }, _count: { select: { entries: true, judges: true } } } }),
  ]);
  return (
    <>
      <PageHeader title={t("التحكيم الشفهي", "Oral judging")} subtitle={t("تصدر النتيجة بعد اكتمال درجات كل المحكمين ثم اعتمادها بقرار بشري.", "A result exists only after every judge has scored and a person approves it.")} />
      <Section title={t("نموذج تحكيم جديد", "New rubric")}>
        <ActionForm path="/rubrics" submit={t("حفظ النموذج", "Save rubric")} transform="rubric" fields={[
          { name: "title", label: t("اسم النموذج", "Rubric name"), required: true },
          { name: "description", label: t("الوصف", "Description") },
          { name: "criteria", label: t("المعايير، كل سطر: المعيار | وصف الدرجة الكاملة | أعلى درجة | الوزن", "Criteria, one per line: name | what full marks mean | maximum | weight"), type: "textarea", required: true, full: true },
        ]} />
      </Section>
      <Section title={t("النماذج", "Rubrics")}>
        {rubrics.length === 0 ? <Empty title={t("لا توجد نماذج.", "No rubrics.")} /> : <ul className="space-y-3">{rubrics.map((r) => <li key={r.id} className="border-b border-line pb-2"><strong>{r.title}</strong><ul className="mt-1 list-disc ps-5 text-sm">{r.criteria.map((c) => <li key={c.id}>{c.labelAr} ({t(`من ${c.maxScore}، الوزن ${c.weight}`, `of ${c.maxScore}, weight ${c.weight}`)}): {c.guidanceAr}</li>)}</ul></li>)}</ul>}
      </Section>
      <Section title={t("جلسة تحكيم جديدة", "New judging session")}>
        {rubrics.length === 0 || competitions.length === 0 ? <Empty title={t("أضف مسابقة ونموذج تحكيم أولاً.", "Add a competition and a rubric first.")} /> : (
          <ActionForm path="/judging" submit={t("إنشاء الجلسة", "Create session")} fields={[
            { name: "title", label: t("عنوان الجلسة", "Title"), required: true },
            { name: "competitionId", label: t("المسابقة", "Competition"), type: "select", required: true, options: competitions.map((c) => ({ value: c.id, label: c.title })) },
            { name: "rubricId", label: t("النموذج", "Rubric"), type: "select", required: true, options: rubrics.map((r) => ({ value: r.id, label: r.title })) },
            { name: "scheduledAt", label: t("الموعد", "Date"), type: "datetime-local", required: true },
            { name: "passPercent", label: t("نسبة النجاح", "Pass percentage"), type: "number", min: 1, max: 100, defaultValue: 60, required: true },
            { name: "judgeIds", label: t("المحكمون", "Judges"), type: "multiselect", required: true, full: true, options: judges.map((j) => ({ value: j.id, label: j.name })) },
          ]} />
        )}
      </Section>
      <Section title={t("الجلسات", "Sessions")}>
        {sessions.length === 0 ? <Empty title={t("لا توجد جلسات.", "No sessions.")} /> : (
          <Table caption={t("الجلسات", "Sessions")} columns={[t("الجلسة", "Session"), t("المسابقة", "Competition"), t("الموعد", "Date"), t("المشاركون", "Participants"), t("المحكمون", "Judges"), t("الحالة", "Status")]}>
            {sessions.map((s) => <tr key={s.id}><td><Link className="underline" href={lp(`/judging/${s.id}`)}>{s.title}</Link></td><td>{s.competition.title}</td><td>{fmtDateTime(locale, s.scheduledAt)}</td><td>{s._count.entries}</td><td>{s._count.judges}</td><td><StatusBadge locale={locale} status={s.status} /></td></tr>)}
          </Table>
        )}
      </Section>
    </>
  );
}
