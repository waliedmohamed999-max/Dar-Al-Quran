import { ActionForm } from "@/components/client";
import { Notice, PageHeader, Section, StatusBadge, Table } from "@/components/ui";
import { systemDb } from "@/lib/db";
import { guard, pageCtx, type PageParams, type SearchProps } from "@/lib/page";
import { CATEGORIES } from "@/modules/adhkar/service";

export const metadata = { title: "إدارة الأذكار | Adhkar", robots: { index: false } };

export default async function AdminAdhkar({ params, searchParams }: PageParams & SearchProps) {
  const { locale, t, lp } = await pageCtx(params);
  await guard(locale, "content.manage");
  const sp = await searchParams;
  const db = systemDb();
  const [list, counts, e] = await Promise.all([
    db.dhikr.findMany({ where: sp.category ? { category: sp.category as never } : {}, orderBy: { sortOrder: "asc" }, take: 100 }),
    db.dhikr.groupBy({ by: ["reviewStatus"], _count: true }),
    sp.edit ? db.dhikr.findUnique({ where: { id: sp.edit } }) : null,
  ]);
  const options = CATEGORIES.map(([value, ar, en]) => ({ value, label: t(ar, en) }));
  return (
    <>
      <PageHeader title={t("إدارة الأذكار", "Manage adhkar")} subtitle={counts.map((c) => `${c.reviewStatus}: ${c._count}`).join(" · ")} />
      <Notice>{t("أي إضافة أو تعديل يعود إلى المراجعة العلمية. الاعتماد من صفحة المراجعة العلمية.", "Any addition or edit returns to scholarly review. Approval happens on the scholarly review page.")}</Notice>
      <Section title={e ? t("تعديل ذكر", "Edit dhikr") : t("ذكر جديد", "New dhikr")}>
        <ActionForm key={e?.id ?? "new"} path={e ? `/adhkar/${e.id}` : "/adhkar"} method={e ? "PUT" : "POST"} resetOnSuccess={!e} submit={t("حفظ وإرسال للمراجعة", "Save and send to review")} fields={[
          { name: "category", label: t("النوع", "Type"), type: "select", required: true, defaultValue: e?.category, options },
          { name: "titleAr", label: t("العنوان", "Title"), required: true, defaultValue: e?.titleAr },
          { name: "text", label: t("نص الذكر بالتشكيل", "Text with diacritics"), type: "textarea", required: true, defaultValue: e?.text },
          { name: "repeat", label: t("العدد المأثور إن ثبت", "Transmitted count, if established"), type: "number", min: 1, defaultValue: e?.repeat ?? undefined },
          { name: "sourceName", label: t("المصدر", "Source"), required: true, defaultValue: e?.sourceName },
          { name: "takhrij", label: t("التخريج", "Takhrij"), full: true, defaultValue: e?.takhrij ?? undefined },
          { name: "explanation", label: t("شرح موثق", "Documented explanation"), type: "textarea", defaultValue: e?.explanation ?? undefined },
          { name: "explanationSource", label: t("مصدر الشرح", "Explanation source"), defaultValue: e?.explanationSource ?? undefined },
          { name: "audioUrl", label: t("صوت مرخص (https)", "Licensed audio (https)"), type: "url", defaultValue: e?.audioUrl ?? undefined },
          { name: "audioSource", label: t("مصدر الصوت", "Audio source"), defaultValue: e?.audioSource ?? undefined },
          { name: "audioLicense", label: t("ترخيص الصوت", "Audio licence"), defaultValue: e?.audioLicense ?? undefined },
          { name: "licenseNote", label: t("بيان الحقوق", "Rights note"), required: true, full: true, defaultValue: e?.licenseNote },
        ]} />
      </Section>
      <Section title={t("الأذكار", "Adhkar")}>
        <Table caption={t("الأذكار", "Adhkar")} columns={[t("العنوان", "Title"), t("النص", "Text"), t("المراجعة", "Review")]}>
          {list.map((d) => <tr key={d.id}><td><a className="underline" href={lp(`/admin/adhkar?edit=${d.id}`)}>{d.titleAr}</a></td><td lang="ar">{d.text.slice(0, 80)}…</td><td><StatusBadge locale={locale} status={d.reviewStatus} /></td></tr>)}
        </Table>
      </Section>
    </>
  );
}
