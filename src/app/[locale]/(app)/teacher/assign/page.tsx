import { ActionForm } from "@/components/client";
import { Empty, PageHeader, Section } from "@/components/ui";
import { systemDb, withActor } from "@/lib/db";
import { guard, pageCtx, type PageParams } from "@/lib/page";
import { approved } from "@/lib/scholarly";

export const metadata = { title: "تعيين الورد | Assign", robots: { index: false } };

export default async function Assign({ params }: PageParams) {
  const { locale, t } = await pageCtx(params);
  const actor = await guard(locale, "tasks.assign");
  const students = await withActor(actor, (tx) => tx.student.findMany({ take: 500, include: { user: { select: { name: true } } }, where: actor.teacherId ? { enrollments: { some: { status: "ACTIVE", halaqa: { teacherId: actor.teacherId } } } } : {} }));
  const [surahs, rules] = await Promise.all([
    systemDb().quranSurah.findMany({ orderBy: { id: "asc" }, select: { id: true, nameArabic: true, nameEnglish: true } }),
    systemDb().tajweedRule.findMany({ where: { ...approved() }, orderBy: { sortOrder: "asc" }, select: { slug: true, titleAr: true, titleEn: true } }),
  ]);
  return (
    <>
      <PageHeader title={t("تعيين الورد", "Assign tasks")} subtitle={t("لطالب واحد أو لمجموعة. اضغط Ctrl لتحديد أكثر من طالب.", "For one student or a group. Hold Ctrl to select several.")} />
      <Section title={t("مهمة جديدة", "New task")}>
        {students.length === 0 ? <Empty title={t("لا يوجد طلاب في حلقاتك.", "No students in your halaqas.")} /> : (
          <ActionForm
            path="/tasks"
            submit={t("تعيين", "Assign")}
            success={t("تم تعيين المهمة.", "Task assigned.")}
            fields={[
              { name: "studentIds", label: t("الطلاب", "Students"), type: "multiselect", required: true, full: true, options: students.map((s) => ({ value: s.id, label: s.user.name })) },
              { name: "date", label: t("التاريخ", "Date"), type: "date", required: true },
              { name: "type", label: t("نوع المهمة", "Task type"), type: "select", required: true, options: [["NEW_MEMORIZATION", "حفظ جديد", "New memorization"], ["NEAR_REVISION", "مراجعة قريبة", "Recent revision"], ["FAR_REVISION", "مراجعة القديم", "Older revision"], ["LISTENING", "استماع", "Listening"], ["RECITATION", "تسميع", "Recitation"], ["TAJWEED", "تجويد", "Tajweed"], ["TAFSIR", "تفسير", "Tafsir"]].map(([value, ar, en]) => ({ value, label: t(ar, en) })) },
              { name: "surahId", label: t("السورة", "Surah"), type: "select", options: surahs.map((s) => ({ value: String(s.id), label: `${s.id}. ${locale === "ar" ? s.nameArabic : s.nameEnglish}` })) },
              { name: "fromAyah", label: t("من الآية", "From ayah"), type: "number", min: 1 },
              { name: "toAyah", label: t("إلى الآية", "To ayah"), type: "number", min: 1 },
              { name: "ruleSlug", label: t("درس التجويد", "Tajweed lesson"), type: "select", options: rules.map((r) => ({ value: r.slug, label: locale === "ar" ? r.titleAr : r.titleEn })) },
              { name: "suggestedMinutes", label: t("الوقت المقترح بالدقائق", "Suggested minutes"), type: "number", min: 1, max: 240, defaultValue: 10 },
              { name: "teacherNote", label: t("ملاحظة", "Note"), type: "textarea" },
            ]}
          />
        )}
      </Section>
    </>
  );
}
