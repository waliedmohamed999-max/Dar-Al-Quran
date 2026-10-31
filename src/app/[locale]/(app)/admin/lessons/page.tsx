import { ActionForm } from "@/components/client";
import { Notice, PageHeader, Section, StatusBadge, Table } from "@/components/ui";
import { systemDb } from "@/lib/db";
import { guard, pageCtx, type PageParams, type SearchProps } from "@/lib/page";

export const metadata = { title: "دروس التجويد | Lessons", robots: { index: false } };

export default async function Lessons({ params, searchParams }: PageParams & SearchProps) {
  const { locale, t, lp } = await pageCtx(params);
  await guard(locale, "content.manage");
  const editId = (await searchParams).edit;
  const db = systemDb();
  const [list, e] = await Promise.all([db.tajweedRule.findMany({ orderBy: { sortOrder: "asc" } }), editId ? db.tajweedRule.findUnique({ where: { id: editId } }) : null]);
  return (
    <>
      <PageHeader title={t("دروس التجويد", "Tajweed lessons")} />
      <Notice>{t("أي تعديل يعيد الدرس إلى انتظار المراجعة العلمية، ولا ينشر قبل اعتماده.", "Any edit returns the lesson to scholarly review. It is not published until approved.")}</Notice>
      <Section title={e ? t("تعديل درس", "Edit lesson") : t("درس جديد", "New lesson")}>
        <ActionForm key={e?.id ?? "new"} path={e ? `/lessons/${e.id}` : "/lessons"} method={e ? "PUT" : "POST"} resetOnSuccess={!e} submit={t("حفظ وإرسال للمراجعة", "Save and send to review")} fields={[
          { name: "titleAr", label: t("العنوان بالعربية", "Title (Arabic)"), required: true, defaultValue: e?.titleAr },
          { name: "titleEn", label: t("العنوان بالإنجليزية", "Title (English)"), required: true, defaultValue: e?.titleEn },
          { name: "slug", label: t("الرابط المختصر", "Slug"), required: true, defaultValue: e?.slug },
          { name: "category", label: t("التصنيف", "Category"), required: true, defaultValue: e?.category ?? "madd" },
          { name: "level", label: t("المستوى", "Level"), type: "number", min: 1, max: 10, required: true, defaultValue: e?.level ?? 1 },
          { name: "bodyAr", label: t("الشرح بالعربية", "Explanation (Arabic)"), type: "textarea", required: true, defaultValue: e?.bodyAr },
          { name: "bodyEn", label: t("الشرح بالإنجليزية", "Explanation (English)"), type: "textarea", required: true, defaultValue: e?.bodyEn },
          { name: "videoUrl", label: t("شرح مرئي مرخص (https)", "Licensed video (https)"), type: "url", defaultValue: e?.videoUrl ?? undefined },
          { name: "audioUrl", label: t("شرح صوتي مرخص (https)", "Licensed audio (https)"), type: "url", defaultValue: e?.audioUrl ?? undefined },
          { name: "mediaSource", label: t("مصدر الوسائط", "Media source"), defaultValue: e?.mediaSource ?? undefined },
          { name: "mediaLicense", label: t("ترخيص الوسائط", "Media licence"), defaultValue: e?.mediaLicense ?? undefined },
        ]} />
      </Section>
      <Section title={t("الدروس", "Lessons")}>
        <Table caption={t("الدروس", "Lessons")} columns={[t("الدرس", "Lesson"), t("المراجعة", "Review")]}>
          {list.map((r) => <tr key={r.id}><td><a className="underline" href={lp(`/admin/lessons?edit=${r.id}`)}>{locale === "ar" ? r.titleAr : r.titleEn}</a></td><td><StatusBadge locale={locale} status={r.reviewStatus} /></td></tr>)}
        </Table>
      </Section>
    </>
  );
}
