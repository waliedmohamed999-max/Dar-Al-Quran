import { AudioLink } from "@/components/v3";
import { ActionForm } from "@/components/client";
import { Empty, PageHeader, Section } from "@/components/ui";
import { systemDb, withActor } from "@/lib/db";
import { guard, pageCtx, type PageParams } from "@/lib/page";
import { approved } from "@/lib/scholarly";

export const metadata = { title: "الأحاديث | Hadith", robots: { index: false } };

export default async function TeacherHadith({ params }: PageParams) {
  const { locale, t } = await pageCtx(params);
  const actor = await guard(locale, "tasks.assign");
  const { students, subs } = await withActor(actor, async (tx) => ({
    students: await tx.student.findMany({ where: actor.teacherId ? { enrollments: { some: { status: "ACTIVE", halaqa: { teacherId: actor.teacherId } } } } : {}, take: 300, select: { id: true, user: { select: { name: true } } } }),
    subs: await tx.hadithSubmission.findMany({ where: { status: "SUBMITTED" }, orderBy: { createdAt: "asc" }, take: 30, select: { id: true, hadith: { select: { number: true } }, student: { select: { user: { select: { name: true } } } } } }),
  }));
  const hadiths = await systemDb().hadithEntry.findMany({ where: { ...approved() }, orderBy: { number: "asc" }, select: { id: true, number: true, collection: { select: { titleAr: true } } } });
  const rubric = ["1", "2", "3", "4", "5"].map((v) => ({ value: v, label: v }));
  return (
    <>
      <PageHeader title={t("الأحاديث", "Hadith")} />
      <Section title={t("تعيين أحاديث للحفظ", "Assign hadiths")}>
        {students.length === 0 || hadiths.length === 0 ? <Empty title={t("يلزم طلاب وأحاديث معتمدة.", "Students and approved hadiths are needed.")} /> : (
          <ActionForm path="/hadith/assign" submit={t("تعيين", "Assign")} fields={[
            { name: "studentIds", label: t("الطلاب", "Students"), type: "multiselect", required: true, options: students.map((s) => ({ value: s.id, label: s.user.name })) },
            { name: "hadithIds", label: t("الأحاديث", "Hadiths"), type: "multiselect", required: true, options: hadiths.map((h) => ({ value: h.id, label: `${h.collection.titleAr} ${h.number}` })) },
            { name: "reciteBy", label: t("موعد التسميع", "Recite by"), type: "date" },
          ]} />
        )}
      </Section>
      <Section title={t("تسميع بانتظار التقييم", "Recitations awaiting review")}>
        {subs.length === 0 ? <Empty title={t("لا يوجد تسميع.", "No recitations.")} /> : subs.map((s) => (
          <div key={s.id} className="mb-4 border-b border-line pb-4">
            <p className="mb-2 font-semibold">{s.student.user.name} — {t("الحديث", "Hadith")} {s.hadith.number}</p>
            <div className="mb-2"><AudioLink path={`/hadith-submissions/${s.id}/audio`} /></div>
            <ActionForm path={`/hadith-submissions/${s.id}/review`} submit={t("حفظ التقييم", "Save")} fields={[
              { name: "memorizationScore", label: t("الحفظ", "Memorization"), type: "select", required: true, defaultValue: "4", options: rubric },
              { name: "understandingScore", label: t("الفهم", "Understanding"), type: "select", required: true, defaultValue: "4", options: rubric },
              { name: "mistakes", label: t("مواضع تحتاج إلى عناية", "Areas to focus on"), full: true },
              { name: "note", label: t("كلمة للطالب", "Note"), full: true },
              { name: "decision", label: t("القرار", "Decision"), type: "select", required: true, defaultValue: "APPROVED", options: [{ value: "APPROVED", label: t("اعتماد الإتقان", "Approve mastery") }, { value: "RESUBMIT", label: t("طلب إعادة", "Ask again") }] },
            ]} />
          </div>
        ))}
      </Section>
    </>
  );
}
