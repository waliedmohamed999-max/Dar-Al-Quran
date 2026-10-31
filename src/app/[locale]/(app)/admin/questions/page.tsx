import { ActionButton, ActionForm } from "@/components/client";
import { Empty, PageHeader, Section, Table } from "@/components/ui";
import { withActor } from "@/lib/db";
import { guard, pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "بنك الأسئلة | Question bank", robots: { index: false } };

export default async function Questions({ params }: PageParams) {
  const { locale, t } = await pageCtx(params);
  const actor = await guard(locale, "assessments.manage");
  const list = await withActor(actor, (tx) => tx.question.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: { id: true, kind: true, type: true, level: true, tag: true, promptAr: true, isDemo: true, aiDraft: true } }));
  return (
    <>
      <PageHeader title={t("بنك الأسئلة", "Question bank")} />
      <Section title={t("سؤال جديد", "New question")}>
        <ActionForm path="/questions" submit={t("إضافة", "Add")} transform="question" fields={[
          { name: "kind", label: t("التصنيف", "Category"), type: "select", required: true, options: [["MEMORIZATION", "حفظ", "Memorization"], ["REVISION", "مراجعة", "Revision"], ["TAJWEED", "تجويد", "Tajweed"], ["TAFSIR", "تفسير", "Tafsir"]].map(([value, ar, en]) => ({ value, label: t(ar, en) })) },
          { name: "type", label: t("النوع", "Type"), type: "select", required: true, options: [["MULTIPLE_CHOICE", "اختيار من متعدد", "Multiple choice"], ["TRUE_FALSE", "صح وخطأ", "True or false"], ["COMPLETE_TEXT", "إكمال نص", "Complete the text"], ["ORDER", "ترتيب", "Order"], ["PRACTICAL", "عملي يراجعه المعلم", "Practical, teacher-graded"], ["RECITATION", "تسميع صوتي", "Audio recitation"], ["ORAL", "تقييم شفهي", "Oral assessment"]].map(([value, ar, en]) => ({ value, label: t(ar, en) })) },
          { name: "level", label: t("المستوى", "Level"), type: "number", min: 1, max: 10, defaultValue: 1 },
          { name: "tag", label: t("وسم", "Tag") },
          { name: "promptAr", label: t("نص السؤال", "Question text"), type: "textarea", required: true },
          { name: "optionA", label: t("الخيار a", "Option a") },
          { name: "optionB", label: t("الخيار b", "Option b") },
          { name: "optionC", label: t("الخيار c", "Option c") },
          { name: "correctKey", label: t("الإجابة الصحيحة", "Correct answer"), hint: t("مفتاح الخيار a أو b أو c، أو النص المتوقع، أو الترتيب مثل b,a,c", "An option key, the expected text, or an order such as b,a,c") },
          { name: "points", label: t("الدرجات", "Points"), type: "number", min: 1, max: 100, defaultValue: 1 },
        ]} />
      </Section>
      <Section title={t("الأسئلة", "Questions")}>
        {list.length === 0 ? <Empty title={t("البنك فارغ.", "The bank is empty.")} /> : (
          <Table caption={t("الأسئلة", "Questions")} columns={[t("السؤال", "Question"), t("التصنيف", "Category"), t("النوع", "Type"), t("المستوى", "Level"), ""]}>
            {list.map((q) => <tr key={q.id}><td>{q.promptAr}</td><td>{q.kind}</td><td>{q.type === "PRACTICAL" ? t("عملي", "Practical") : t("اختيار", "Choice")}</td><td>{q.level}</td><td>{q.aiDraft && <ActionButton path={`/questions/${q.id}/activate`} label={t("مراجعة وتفعيل المسودة", "Reviewed: activate draft")} />}</td></tr>)}
          </Table>
        )}
      </Section>
    </>
  );
}
