import { ActionButton, ActionForm } from "@/components/client";
import { Empty, PageHeader, Section, StatusBadge, Table } from "@/components/ui";
import { systemDb } from "@/lib/db";
import { guard, pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "المسابقات | Competitions", robots: { index: false } };

export default async function AdminCompetitions({ params }: PageParams) {
  const { locale, t } = await pageCtx(params);
  await guard(locale, "assessments.manage");
  const db = systemDb();
  const [list, questions, appeals, passed] = await Promise.all([
    db.competition.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { registrations: true } } } }),
    db.question.findMany({ where: { active: true }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, promptAr: true, type: true } }),
    db.examAppeal.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 30 }),
    db.assessmentAttempt.findMany({ where: { status: "GRADED", assessment: { competitions: { some: {} } } }, orderBy: { submittedAt: "desc" }, take: 50, include: { assessment: { select: { title: true, passPercent: true } }, student: { select: { user: { select: { name: true } } } } } }),
  ]);
  return (
    <>
      <PageHeader title={t("المسابقات والاختبارات", "Competitions and examinations")} subtitle={t("الأسئلة من بنك الأسئلة. يصحح التسميع والإجابات العملية من صفحة الاختبارات.", "Questions come from the bank. Recitation and practical answers are graded on the assessments page.")} />
      <Section title={t("مسابقة جديدة", "New competition")}>
        {questions.length === 0 ? <Empty title={t("أضف أسئلة مفعلة أولاً.", "Add active questions first.")} /> : (
          <ActionForm path="/competitions" submit={t("إنشاء", "Create")} transform="competition" fields={[
            { name: "title", label: t("الاسم", "Name"), required: true },
            { name: "slug", label: t("الرابط المختصر", "Slug"), required: true },
            { name: "description", label: t("الوصف", "Description"), type: "textarea", required: true },
            { name: "kind", label: t("النوع", "Type"), type: "select", required: true, options: [["quran_memorization", "حفظ القرآن", "Quran memorization"], ["tajweed", "التجويد", "Tajweed"], ["tafsir", "التفسير", "Tafsir"], ["hadith", "حفظ الحديث", "Hadith"], ["quran_knowledge", "معلومات قرآنية", "Quran knowledge"], ["revision", "المراجعة", "Revision"], ["periodic", "اختبار دوري", "Periodic"], ["level_completion", "إتمام مستوى", "Level completion"]].map(([value, ar, en]) => ({ value, label: t(ar, en) })) },
            { name: "level", label: t("المستوى", "Level"), type: "select", required: true, options: [["beginner", "مبتدئ", "Beginner"], ["intermediate", "متوسط", "Intermediate"], ["advanced", "متقدم", "Advanced"]].map(([value, ar, en]) => ({ value, label: t(ar, en) })) },
            { name: "ageGroup", label: t("الفئة", "Audience") },
            { name: "conditions", label: t("الشروط", "Conditions"), type: "textarea" },
            { name: "criteria", label: t("معايير التقييم المنشورة", "Published criteria"), type: "textarea", required: true },
            { name: "resultsMethod", label: t("طريقة إعلان النتائج", "How results are announced"), required: true },
            { name: "prizes", label: t("الجوائز", "Prizes") },
            { name: "registrationOpensAt", label: t("بداية التسجيل", "Registration opens"), type: "datetime-local", required: true },
            { name: "registrationClosesAt", label: t("نهاية التسجيل", "Registration closes"), type: "datetime-local", required: true },
            { name: "examStartsAt", label: t("بداية الاختبار", "Exam opens"), type: "datetime-local", required: true },
            { name: "examEndsAt", label: t("نهاية الاختبار", "Exam closes"), type: "datetime-local", required: true },
            { name: "durationMin", label: t("المدة بالدقائق", "Minutes"), type: "number", min: 1, required: true, defaultValue: 30 },
            { name: "maxAttempts", label: t("عدد المحاولات", "Attempts"), type: "number", min: 1, max: 10, defaultValue: 1 },
            { name: "questionIds", label: t("الأسئلة", "Questions"), type: "multiselect", required: true, full: true, options: questions.map((q) => ({ value: q.id, label: q.promptAr.slice(0, 90) })) },
            { name: "randomize", label: t("ترتيب عشوائي للأسئلة", "Random question order"), type: "checkbox", defaultValue: true },
            { name: "leaderboardEnabled", label: t("لوحة ترتيب اختيارية", "Optional leaderboard"), type: "checkbox" },
            { name: "published", label: t("نشر", "Publish"), type: "checkbox" },
          ]} />
        )}
      </Section>
      <Section title={t("المسابقات", "Competitions")}>
        {list.length === 0 ? <Empty title={t("لا توجد مسابقات.", "No competitions.")} /> : (
          <Table caption={t("المسابقات", "Competitions")} columns={[t("الاسم", "Name"), t("المسجلون", "Registered"), t("الحالة", "Status"), ""]}>
            {list.map((c) => <tr key={c.id}><td>{c.title}</td><td>{c._count.registrations}</td><td><StatusBadge locale={locale} status={c.published ? "PUBLISHED" : "DRAFT"} /></td><td>{!c.resultsPublished && <ActionButton path={`/competitions/${c.id}/publish-results`} label={t("إعلان النتائج", "Publish results")} confirm={t("هل اكتمل التحكيم؟", "Is judging complete?")} />}</td></tr>)}
          </Table>
        )}
      </Section>
      <Section title={t("نتائج ناجحة تنتظر طلب شهادة", "Passing results awaiting a certificate request")}>
        {passed.filter((a) => (a.scorePercent ?? 0) >= a.assessment.passPercent).length === 0 ? <Empty title={t("لا توجد نتائج ناجحة.", "No passing results.")} /> : <ul className="space-y-3">{passed.filter((a) => (a.scorePercent ?? 0) >= a.assessment.passPercent).map((a) => <li key={a.id} className="border-b border-line pb-2"><p className="mb-1 text-sm"><strong>{a.student.user.name}</strong>: {a.assessment.title} ({a.scorePercent}%)</p><ActionForm path="/certificates/from-result" submit={t("طلب شهادة للاعتماد", "Request a certificate for approval")} fields={[{ name: "evidenceType", type: "hidden", label: "", defaultValue: "attempt" }, { name: "evidenceId", type: "hidden", label: "", defaultValue: a.id }, { name: "title", label: t("عنوان الشهادة", "Certificate title"), required: true, defaultValue: a.assessment.title }]} /></li>)}</ul>}
      </Section>
      <Section title={t("الاعتراضات", "Appeals")}>
        {appeals.length === 0 ? <Empty title={t("لا توجد اعتراضات.", "No appeals.")} /> : appeals.map((a) => (
          <div key={a.id} className="mb-3 border-b border-line pb-3"><p className="mb-2">{a.reason}</p>
            <ActionForm path={`/appeals/${a.id}/decide`} submit={t("حفظ القرار", "Save decision")} transform="appeal" fields={[{ name: "accept", label: t("قبول الاعتراض", "Accept the appeal"), type: "checkbox" }, { name: "newScore", label: t("الدرجة المصححة إن لزم (0-100)", "Corrected score if needed (0-100)"), type: "number", min: 0, max: 100 }, { name: "decision", label: t("نص القرار", "Decision"), type: "textarea", required: true }]} />
          </div>
        ))}
      </Section>
    </>
  );
}
