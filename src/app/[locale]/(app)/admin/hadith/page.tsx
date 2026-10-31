import { ActionButton, ActionForm } from "@/components/client";
import { Notice, PageHeader, Section, StatusBadge, Table } from "@/components/ui";
import { systemDb } from "@/lib/db";
import { guard, pageCtx, type PageParams, type SearchProps } from "@/lib/page";

export const metadata = { title: "مصادر الأحاديث | Hadith sources", robots: { index: false } };

export default async function AdminHadith({ params, searchParams }: PageParams & SearchProps) {
  const { locale, t, lp } = await pageCtx(params);
  const editId = (await searchParams).edit;
  const e = editId ? await systemDb().hadithEntry.findUnique({ where: { id: editId } }) : null;
  const actor = await guard(locale, "content.manage");
  const cols = await systemDb().hadithCollection.findMany({ include: { entries: { orderBy: { number: "asc" }, select: { id: true, number: true, text: true, reviewStatus: true, grade: true, explanation: true } } } });
  const canReview = actor.perms.has("scholarly.review");
  return (
    <>
      <PageHeader title={t("مصادر الأحاديث", "Hadith sources")} />
      <Notice tone="warn">{t("قابل النصوص بنسخة محققة قبل الاعتماد. الدرجة والشرح يضافان من مرجع مسمى فقط.", "Check texts against a verified edition before approving. Grades and explanations come only from a named reference.")}</Notice>
      {e && (
        <Section title={t(`تعديل الحديث ${e.number}`, `Edit hadith ${e.number}`)}>
          <ActionForm key={e.id} path={`/hadith/${e.id}`} method="PUT" transform="hadithEdit" resetOnSuccess={false} submit={t("حفظ وإرسال للمراجعة", "Save and send to review")} fields={[
            { name: "text", label: t("النص", "Text"), type: "textarea", required: true, defaultValue: e.text },
            { name: "narrator", label: t("الراوي", "Narrator"), defaultValue: e.narrator ?? undefined },
            { name: "sourceRef", label: t("المرجع", "Reference"), defaultValue: e.sourceRef ?? undefined },
            { name: "topic", label: t("الموضوع", "Topic"), defaultValue: e.topic ?? undefined },
            { name: "grade", label: t("الحكم كما نقله المرجع", "Grade as transmitted"), defaultValue: e.grade ?? undefined },
            { name: "gradeSource", label: t("مرجع الحكم", "Grade reference"), defaultValue: e.gradeSource ?? undefined },
            { name: "explanationSource", label: t("مصدر الشرح", "Explanation source"), defaultValue: e.explanationSource ?? undefined },
            { name: "explanation", label: t("الشرح من المصدر", "Explanation from the source"), type: "textarea", defaultValue: e.explanation ?? undefined },
            { name: "benefits", label: t("الفوائد من المصدر", "Lessons from the source"), type: "textarea", defaultValue: e.benefits ?? undefined },
            { name: "vocabulary", label: t("معاني الكلمات: كلمة: معنى في كل سطر", "Word meanings: word: meaning per line"), type: "textarea", defaultValue: ((e.vocabulary as { word: string; meaning: string }[] | null) ?? []).map((v) => `${v.word}: ${v.meaning}`).join("\n") },
          ]} />
        </Section>
      )}
      {cols.map((c) => (
        <Section key={c.id} title={c.titleAr} actions={<span className="flex items-center gap-2"><StatusBadge locale={locale} status={c.published ? "PUBLISHED" : "DRAFT"} />{canReview && <ActionButton path={`/hadith-collections/${c.id}/publish`} body={{ published: !c.published }} label={c.published ? t("إخفاء", "Hide") : t("نشر المسار", "Publish track")} />}</span>}>
          <p className="mb-3 text-sm text-ink-2">{c.sourceName}. {c.licenseNote}</p>
          <div className="mb-4 rounded-lg border border-line p-3">
            <h3 className="mb-2 font-semibold">{t("الاختبار النهائي", "Final exam")}</h3>
            {!c.finalCompetitionId ? (
              <ActionForm path={`/hadith-collections/${c.id}/final-exam`} submit={t("إنشاء مسودة من النصوص المعتمدة", "Build a draft from approved text")} fields={[
                { name: "completionCount", label: t("أسئلة الإكمال", "Completion questions"), type: "number", min: 1, max: 42, defaultValue: 10, required: true },
                { name: "recitationCount", label: t("أسئلة التسميع", "Recitation questions"), type: "number", min: 1, max: 42, defaultValue: 5, required: true },
                { name: "passPercent", label: t("نسبة النجاح", "Pass percentage"), type: "number", min: 1, max: 100, defaultValue: 70, required: true },
                { name: "durationMin", label: t("المدة بالدقائق", "Minutes"), type: "number", min: 5, defaultValue: 60, required: true },
                { name: "opensAt", label: t("يفتح", "Opens"), type: "datetime-local", required: true },
                { name: "closesAt", label: t("يغلق", "Closes"), type: "datetime-local", required: true },
              ]} />
            ) : canReview ? <ActionButton path={`/hadith-collections/${c.id}/final-exam/publish`} label={t("نشر الاختبار النهائي", "Publish the final exam")} /> : <p className="text-sm text-ink-2">{t("أنشئت المسودة، وينشرها المراجع العلمي.", "The draft exists. A scholarly reviewer publishes it.")}</p>}
            <p className="mt-2 text-xs text-ink-2">{t("لا ينشأ إلا بعد اعتماد كل أحاديث المسار. يقيم المعلم التسميع، ولا تصدر شهادة دون اعتماد بشري.", "Available only when every hadith is approved. A teacher grades recitation, and no certificate issues without human approval.")}</p>
          </div>
          <Table caption={c.titleAr} columns={[t("الرقم", "No."), t("النص", "Text"), t("الحكم", "Grade"), t("الشرح", "Explanation"), t("المراجعة", "Review"), ""]}>
            {c.entries.map((x) => <tr key={x.id}><td><a className="underline" href={lp(`/admin/hadith?edit=${x.id}`)}>{x.number}</a></td><td lang="ar">{x.text.slice(0, 90)}…</td><td>{x.grade ?? "—"}</td><td>{x.explanation ? "✓" : "—"}</td><td><StatusBadge locale={locale} status={x.reviewStatus} /></td><td>{canReview && x.reviewStatus !== "APPROVED" && <ActionButton path={`/scholarly/hadith/${x.id}`} body={{ approve: true }} label={t("اعتماد", "Approve")} />}</td></tr>)}
          </Table>
        </Section>
      ))}
    </>
  );
}
