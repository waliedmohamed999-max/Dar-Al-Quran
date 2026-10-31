import { ActionForm } from "@/components/client";
import { Empty, PageHeader, Section, StatusBadge } from "@/components/ui";
import { withActor } from "@/lib/db";
import { guard, pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "الاختبارات | Assessments", robots: { index: false } };

export default async function TeacherAssessments({ params }: PageParams) {
  const { locale, t } = await pageCtx(params);
  const actor = await guard(locale, "assessments.manage");
  const { questions, halaqas, toGrade, list, students } = await withActor(actor, async (tx) => ({
    questions: await tx.question.findMany({ where: { active: true }, select: { id: true, promptAr: true, kind: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    halaqas: await tx.halaqa.findMany({ where: actor.teacherId ? { teacherId: actor.teacherId } : {}, select: { id: true, name: true } }),
    toGrade: await tx.assessmentAttempt.findMany({
      where: { status: "SUBMITTED" },
      include: {
        student: { select: { user: { select: { name: true } } } },
        assessment: { select: { title: true } },
        answers: { where: { question: { type: "PRACTICAL" } }, select: { questionId: true, textAnswer: true, question: { select: { promptAr: true } } } },
      },
    }),
    list: await tx.assessment.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { _count: { select: { attempts: true } } } }),
    students: await tx.student.findMany({ where: actor.teacherId ? { enrollments: { some: { status: "ACTIVE", halaqa: { teacherId: actor.teacherId } } } } : {}, include: { user: { select: { name: true } } }, take: 300 }),
  }));
  return (
    <>
      <PageHeader title={t("الاختبارات", "Assessments")} />
      <Section title={t("إجابات عملية بانتظار التصحيح", "Practical answers to grade")}>
        {toGrade.length === 0 ? <Empty title={t("لا توجد إجابات بانتظارك.", "Nothing waiting for you.")} /> : toGrade.map((a) => (
          <div key={a.id} className="mb-4 border-b border-line pb-4">
            <p className="font-semibold">{a.student.user.name} — {a.assessment.title}</p>
            {a.answers.map((x) => (
              <div key={x.questionId} className="mt-2">
                <p className="text-sm text-ink-2">{x.question.promptAr}</p>
                <p className="mb-2 rounded bg-surface-2 p-2 text-sm">{x.textAnswer ?? "—"}</p>
                <ActionForm
                  path={`/attempts/${a.id}/grade`}
                  submit={t("حفظ الدرجة", "Save grade")}
                  transform="grade"
                  fields={[
                    { name: "questionId", label: "", type: "hidden", defaultValue: x.questionId },
                    { name: "ratio", label: t("الدرجة", "Grade"), type: "select", required: true, defaultValue: "1", options: [["1", "كاملة", "Full"], ["0.5", "نصف", "Half"], ["0", "تحتاج إلى إعادة", "Needs another try"]].map(([value, ar, en]) => ({ value, label: t(ar, en) })) },
                    { name: "teacherNote", label: t("ملاحظة", "Note"), full: true },
                  ]}
                />
              </div>
            ))}
          </div>
        ))}
      </Section>
      <Section title={t("إنشاء اختبار", "Create assessment")}>
        {questions.length === 0 ? <Empty title={t("بنك الأسئلة فارغ.", "The question bank is empty.")} /> : (
          <ActionForm
            path="/assessments"
            submit={t("إنشاء", "Create")}
            transform="assessment"
            fields={[
              { name: "title", label: t("العنوان", "Title"), required: true },
              { name: "kind", label: t("النوع", "Type"), type: "select", required: true, options: [["MEMORIZATION", "حفظ", "Memorization"], ["REVISION", "مراجعة", "Revision"], ["TAJWEED", "تجويد", "Tajweed"], ["TAFSIR", "تفسير", "Tafsir"]].map(([value, ar, en]) => ({ value, label: t(ar, en) })) },
              { name: "halaqaId", label: t("الحلقة", "Halaqa"), type: "select", options: halaqas.map((h) => ({ value: h.id, label: h.name })) },
              { name: "passPercent", label: t("نسبة النجاح", "Pass percent"), type: "number", min: 1, max: 100, defaultValue: 60 },
              { name: "questionIds", label: t("الأسئلة", "Questions"), type: "multiselect", required: true, full: true, options: questions.map((q) => ({ value: q.id, label: q.promptAr.slice(0, 90) })) },
              { name: "published", label: t("نشر الاختبار للطلاب", "Publish to students"), type: "checkbox" },
            ]}
          />
        )}
      </Section>
      <Section title={t("الاختبارات الحالية", "Existing assessments")}>
        {list.length === 0 ? <Empty title={t("لا توجد اختبارات.", "No assessments.")} /> : (
          <ul className="space-y-1">{list.map((a) => <li key={a.id} className="flex flex-wrap items-center gap-2">{a.title} <StatusBadge locale={locale} status={a.published ? "PUBLISHED" : "DRAFT"} /> <span className="text-xs text-ink-2">{t(`محاولات: ${a._count.attempts}`, `Attempts: ${a._count.attempts}`)}</span></li>)}</ul>
        )}
      </Section>
      <Section title={t("طلب شهادة لطالب", "Request a certificate")}>
        <p className="mb-3 text-sm text-ink-2">{t("يرسل الطلب إلى مخول بالاعتماد، ولا تصدر الشهادة قبل موافقته.", "The request goes to an authorized approver. No certificate is issued before they approve.")}</p>
        {students.length === 0 ? <Empty title={t("لا يوجد طلاب.", "No students.")} /> : (
          <ActionForm path="/certificates" submit={t("إرسال الطلب", "Send request")} fields={[
            { name: "studentId", label: t("الطالب", "Student"), type: "select", required: true, options: students.map((s) => ({ value: s.id, label: s.user.name })) },
            { name: "title", label: t("عنوان الشهادة", "Certificate title"), required: true },
            { name: "scope", label: t("النطاق (مثل: جزء عم)", "Scope (e.g. Juz Amma)"), full: true },
          ]} />
        )}
      </Section>
    </>
  );
}
