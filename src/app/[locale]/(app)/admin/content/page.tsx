import { ActionButton, ActionForm } from "@/components/client";
import { Empty, Notice, PageHeader, Section, StatusBadge, Table } from "@/components/ui";
import { withActor } from "@/lib/db";
import { guard, pageCtx, type PageParams, type SearchProps } from "@/lib/page";

export const metadata = { title: "إدارة المحتوى | Content", robots: { index: false } };

export default async function Content({ params, searchParams }: PageParams & SearchProps) {
  const { locale, t, lp } = await pageCtx(params);
  const actor = await guard(locale, "content.manage");
  const editId = (await searchParams).edit;
  const { list, editing } = await withActor(actor, async (tx) => ({
    list: await tx.contentPage.findMany({ orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, type: true, slug: true, locale: true, title: true, status: true } }),
    editing: editId ? await tx.contentPage.findUnique({ where: { id: editId } }) : null,
  }));
  const canPublish = actor.perms.has("content.review");
  return (
    <>
      <PageHeader title={t("إدارة المحتوى", "Content management")} subtitle={t("ينتقل المحتوى من مسودة إلى مراجعة ثم نشر.", "Content moves from draft to review to published.")} />
      <Notice>{t("الآراء تنشر فقط إذا كانت حقيقية وموثقة بموافقة صاحبها. لا تنشر شهادات اعتماد أو إحصاءات دون إثبات.", "Publish testimonials only if genuine and documented with consent. Do not publish accreditations or statistics without evidence.")}</Notice>
      <Section title={editing ? t("تعديل المحتوى", "Edit content") : t("محتوى جديد", "New content")}>
        <ActionForm
          key={editing?.id ?? "new"}
          path={editing ? `/content/${editing.id}` : "/content"}
          method={editing ? "PUT" : "POST"}
          submit={t("حفظ", "Save")}
          resetOnSuccess={!editing}
          fields={[
            { name: "type", label: t("النوع", "Type"), type: "select", required: true, defaultValue: editing?.type, options: [["ARTICLE", "مقال", "Article"], ["NEWS", "خبر", "News"], ["PAGE", "صفحة", "Page"], ["FAQ", "سؤال شائع", "FAQ"], ["TESTIMONIAL", "رأي موثق", "Testimonial"], ["LIBRARY", "مادة مكتبة", "Library item"], ["EVENT", "فعالية", "Event"]].map(([value, ar, en]) => ({ value, label: t(ar, en) })) },
            { name: "locale", label: t("اللغة", "Language"), type: "select", required: true, defaultValue: editing?.locale ?? locale, options: [{ value: "ar", label: "العربية" }, { value: "en", label: "English" }] },
            { name: "title", label: t("العنوان", "Title"), required: true, defaultValue: editing?.title },
            { name: "slug", label: t("الرابط المختصر (أحرف إنجليزية)", "Slug (English letters)"), required: true, defaultValue: editing?.slug, hint: "about, privacy, terms…" },
            { name: "excerpt", label: t("مقتطف", "Excerpt"), full: true, defaultValue: editing?.excerpt ?? undefined },
            { name: "body", label: t("النص (HTML مبسط)", "Body (simple HTML)"), type: "textarea", required: true, max: 12, defaultValue: editing?.body, hint: t("ينقى النص من الوسوم غير الآمنة عند الحفظ.", "Unsafe tags are removed on save.") },
            { name: "sortOrder", label: t("الترتيب", "Order"), type: "number", defaultValue: editing?.sortOrder ?? 0 },
            { name: "category", label: t("التصنيف (مثل tajweed أو lectures)", "Category (e.g. tajweed, lectures)"), defaultValue: editing?.category ?? undefined },
            { name: "imageUrl", label: t("رابط الصورة (https)", "Image URL (https)"), type: "url", defaultValue: editing?.imageUrl ?? undefined },
            { name: "mediaUrl", label: t("رابط فيديو أو ملف (https)", "Video or file URL (https)"), type: "url", defaultValue: editing?.mediaUrl ?? undefined, hint: t("تأكد من حقوق الاستخدام.", "Confirm usage rights.") },
            { name: "seoTitle", label: t("عنوان محركات البحث", "SEO title"), defaultValue: editing?.seoTitle ?? undefined },
            { name: "seoDescription", label: t("وصف محركات البحث", "SEO description"), full: true, defaultValue: editing?.seoDescription ?? undefined },
            { name: "featured", label: t("مميز", "Featured"), type: "checkbox", defaultValue: editing?.featured },
          ]}
        />
      </Section>
      <Section title={t("المحتوى", "Content")}>
        {list.length === 0 ? <Empty title={t("لا يوجد محتوى.", "No content.")} /> : (
          <Table caption={t("المحتوى", "Content")} columns={[t("العنوان", "Title"), t("النوع", "Type"), t("اللغة", "Language"), t("الحالة", "Status"), t("إجراءات", "Actions")]}>
            {list.map((c) => (
              <tr key={c.id}>
                <td><a className="underline" href={lp(`/admin/content?edit=${c.id}`)}>{c.title}</a></td><td>{c.type}</td><td>{c.locale}</td><td><StatusBadge locale={locale} status={c.status} /></td>
                <td className="flex flex-wrap gap-2">
                  {c.status === "DRAFT" && <ActionButton path={`/content/${c.id}/status`} body={{ status: "IN_REVIEW" }} label={t("إرسال للمراجعة", "Send to review")} />}
                  {c.status === "IN_REVIEW" && canPublish && <ActionButton path={`/content/${c.id}/status`} body={{ status: "PUBLISHED" }} label={t("نشر", "Publish")} variant="primary" />}
                  {c.status === "PUBLISHED" && <ActionButton path={`/content/${c.id}/status`} body={{ status: "ARCHIVED" }} label={t("أرشفة", "Archive")} />}
                  {c.status === "ARCHIVED" && <ActionButton path={`/content/${c.id}/status`} body={{ status: "DRAFT" }} label={t("إعادة كمسودة", "Back to draft")} />}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </>
  );
}
