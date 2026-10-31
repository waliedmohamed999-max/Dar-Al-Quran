import { ActionForm } from "@/components/client";
import { Empty, PageHeader, Section, StatusBadge, Table } from "@/components/ui";
import { systemDb } from "@/lib/db";
import { guard, pageCtx, type PageParams, type SearchProps } from "@/lib/page";

export const metadata = { title: "البرامج التعليمية | Programs", robots: { index: false } };
const lines = (v?: string[]) => (v ?? []).join("\n");

export default async function AdminPrograms({ params, searchParams }: PageParams & SearchProps) {
  const { locale, t, lp } = await pageCtx(params);
  await guard(locale, "content.manage");
  const editId = (await searchParams).edit;
  const db = systemDb();
  const [list, e] = await Promise.all([db.program.findMany({ orderBy: { sortOrder: "asc" } }), editId ? db.program.findUnique({ where: { id: editId } }) : null]);
  return (
    <>
      <PageHeader title={t("البرامج التعليمية", "Programs")} subtitle={t("صفحات البرامج العامة تعرض من هنا. اكتب كل بند في سطر.", "Public program pages come from here. Put each item on its own line.")} />
      <Section title={e ? t("تعديل برنامج", "Edit program") : t("برنامج جديد", "New program")}>
        <ActionForm key={e?.id ?? "new"} path={e ? `/programs/${e.id}` : "/programs"} method={e ? "PUT" : "POST"} transform="program" resetOnSuccess={!e} submit={t("حفظ", "Save")} fields={[
          { name: "titleAr", label: t("العنوان بالعربية", "Title (Arabic)"), required: true, defaultValue: e?.titleAr },
          { name: "titleEn", label: t("العنوان بالإنجليزية", "Title (English)"), required: true, defaultValue: e?.titleEn },
          { name: "slug", label: t("الرابط المختصر", "Slug"), required: true, defaultValue: e?.slug },
          { name: "sortOrder", label: t("الترتيب", "Order"), type: "number", defaultValue: e?.sortOrder ?? 0 },
          { name: "summaryAr", label: t("نبذة بالعربية", "Summary (Arabic)"), required: true, full: true, defaultValue: e?.summaryAr },
          { name: "summaryEn", label: t("نبذة بالإنجليزية", "Summary (English)"), required: true, full: true, defaultValue: e?.summaryEn },
          { name: "overviewAr", label: t("نظرة عامة", "Overview"), type: "textarea", required: true, defaultValue: e?.overviewAr },
          { name: "objectivesAr", label: t("الأهداف", "Objectives"), type: "textarea", defaultValue: lines(e?.objectivesAr) },
          { name: "audienceAr", label: t("الفئة المستهدفة", "Audience"), type: "textarea", defaultValue: lines(e?.audienceAr) },
          { name: "levelsAr", label: t("المستويات", "Levels"), type: "textarea", defaultValue: lines(e?.levelsAr) },
          { name: "curriculumAr", label: t("هيكل المنهج", "Curriculum"), type: "textarea", defaultValue: lines(e?.curriculumAr) },
          { name: "outcomesAr", label: t("نواتج التعلم", "Outcomes"), type: "textarea", defaultValue: lines(e?.outcomesAr) },
          { name: "requirementsAr", label: t("متطلبات الالتحاق", "Requirements"), type: "textarea", defaultValue: lines(e?.requirementsAr) },
          { name: "instructorNoteAr", label: t("معلومات المعلمين (المتحقق منها فقط)", "Instructor information (verified only)"), full: true, defaultValue: e?.instructorNoteAr ?? "" },
          { name: "requiresQualifiedTeachers", label: t("يتوقف على توفر معلمين مؤهلين", "Depends on qualified teachers"), type: "checkbox", defaultValue: e?.requiresQualifiedTeachers },
          { name: "featured", label: t("مميز في الرئيسية", "Featured on home"), type: "checkbox", defaultValue: e?.featured },
          { name: "published", label: t("منشور", "Published"), type: "checkbox", defaultValue: e?.published ?? true },
        ]} />
      </Section>
      <Section title={t("البرامج", "Programs")}>
        {list.length === 0 ? <Empty title={t("لا توجد برامج.", "No programs.")} /> : (
          <Table caption={t("البرامج", "Programs")} columns={[t("العنوان", "Title"), t("الحالة", "Status"), t("مميز", "Featured")]}>
            {list.map((p) => <tr key={p.id}><td><a className="underline" href={lp(`/admin/programs?edit=${p.id}`)}>{locale === "ar" ? p.titleAr : p.titleEn}</a></td><td><StatusBadge locale={locale} status={p.published ? "PUBLISHED" : "DRAFT"} /></td><td>{p.featured ? "✓" : ""}</td></tr>)}
          </Table>
        )}
      </Section>
    </>
  );
}
