import { ActionForm } from "@/components/client";
import { Empty, Notice, PageHeader, Section, StatusBadge, Table } from "@/components/ui";
import { systemDb } from "@/lib/db";
import { guard, pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "موارد الدراسة | Study resources", robots: { index: false } };
const KINDS: [string, string, string][] = [["VOCABULARY", "معنى مفردة", "Word meaning"], ["ASBAB", "سبب نزول", "Occasion of revelation"], ["TOPIC", "موضوع", "Topic"]];

export default async function StudyResources({ params }: PageParams) {
  const { locale, t } = await pageCtx(params);
  await guard(locale, "content.manage");
  const db = systemDb();
  const [list, surahs] = await Promise.all([db.studyResource.findMany({ orderBy: { createdAt: "desc" }, take: 200 }), db.quranSurah.findMany({ orderBy: { id: "asc" }, select: { id: true, nameArabic: true, nameEnglish: true } })]);
  return (
    <>
      <PageHeader title={t("موارد الدراسة", "Study resources")} subtitle={t("معاني المفردات وأسباب النزول والموضوعات.", "Word meanings, occasions of revelation and topics.")} />
      <Notice tone="warn">{t("انقل النص من مرجع محقق تملك حق استخدامه واذكره. لا يظهر شيء قبل الاعتماد العلمي، وأي تعديل يعيده إلى المراجعة.", "Copy from a verified reference you may use, and name it. Nothing appears before scholarly approval, and any edit returns it to review.")}</Notice>
      <Section title={t("مورد جديد", "New resource")}>
        <ActionForm path="/study-resources" submit={t("حفظ وإرسال للمراجعة", "Save and send to review")} fields={[
          { name: "kind", label: t("النوع", "Type"), type: "select", required: true, options: KINDS.map(([value, ar, en]) => ({ value, label: t(ar, en) })) },
          { name: "surahId", label: t("السورة", "Surah"), type: "select", required: true, options: surahs.map((s) => ({ value: String(s.id), label: `${s.id}. ${locale === "ar" ? s.nameArabic : s.nameEnglish}` })) },
          { name: "fromAyah", label: t("من آية", "From ayah"), type: "number", min: 1, required: true },
          { name: "toAyah", label: t("إلى آية", "To ayah"), type: "number", min: 1, required: true },
          { name: "term", label: t("المفردة (لمعاني المفردات)", "Word (for word meanings)") },
          { name: "sourceName", label: t("اسم المرجع", "Reference name"), required: true },
          { name: "sourceRef", label: t("الجزء والصفحة أو الرابط", "Volume and page, or link"), required: true },
          { name: "licenseNote", label: t("بيان حق الاستخدام", "Rights note"), required: true },
          { name: "body", label: t("النص من المرجع", "Text from the reference"), type: "textarea", required: true, full: true },
        ]} />
      </Section>
      <Section title={t("الموارد", "Resources")}>
        {list.length === 0 ? <Empty title={t("لا توجد موارد بعد.", "No resources yet.")} hint={t("لا تضيفها المنصة من تلقاء نفسها.", "The platform never adds them by itself.")} /> : (
          <Table caption={t("الموارد", "Resources")} columns={[t("النوع", "Type"), t("الموضع", "Position"), t("النص", "Text"), t("المرجع", "Reference"), t("المراجعة", "Review")]}>
            {list.map((r) => <tr key={r.id}><td>{r.kind}</td><td>{r.surahId}:{r.fromAyah}–{r.toAyah}</td><td lang="ar">{r.term ? `${r.term}: ` : ""}{r.body.slice(0, 80)}</td><td>{r.sourceName}</td><td><StatusBadge locale={locale} status={r.reviewStatus} /></td></tr>)}
          </Table>
        )}
      </Section>
    </>
  );
}
