import { readFileSync } from "node:fs";
import Link from "next/link";
import { ActionForm } from "@/components/client";
import { Empty, Notice, PageHeader, Section, StatusBadge, Table } from "@/components/ui";
import { systemDb } from "@/lib/db";
import { fmtDateTime } from "@/lib/i18n";
import { guard, pageCtx, type PageParams, type SearchProps } from "@/lib/page";
import { itemHistory, reviewItems, scholars } from "@/modules/cms/scholarly";
import type { ScholarlyTarget } from "@/modules/cms/service";

export const metadata = { title: "المراجعة العلمية | Scholarly review", robots: { index: false } };

const TYPES: Record<string, [string, string]> = {
  dhikr: ["ذكر", "Dhikr"], hadith: ["حديث", "Hadith"], tajweed_rule: ["درس تجويد", "Tajweed lesson"], tajweed_example: ["مثال تجويد", "Tajweed example"], tafsir_source: ["مصدر تفسير", "Tafsir source"], study_resource: ["مورد دراسي", "Study resource"],
};
const PAGE = 25;

export default async function Scholarly({ params, searchParams }: PageParams & SearchProps) {
  const { locale, t, lp } = await pageCtx(params);
  const actor = await guard(locale, "scholarly.review");
  const sp = await searchParams;
  const status = ["PENDING", "APPROVED", "REJECTED"].includes(sp.status ?? "") ? sp.status! : "PENDING";
  const type = sp.type && TYPES[sp.type] ? sp.type : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const [all, people, annotated, assignments, latest] = await Promise.all([
    reviewItems(actor), scholars(actor), systemDb().tajweedAnnotation.count(),
    systemDb().reviewAssignment.findMany(), systemDb().contentReview.findMany({ orderBy: { createdAt: "desc" }, take: 2000, select: { targetType: true, targetId: true, reason: true, decision: true } }),
  ]);
  const manifest = JSON.parse(readFileSync("data/quran/manifest.json", "utf8"));
  const names = new Map(people.map((p) => [p.id, p.name]));
  const owner = new Map(assignments.map((a) => [`${a.targetType}:${a.targetId}`, a.reviewerId]));
  const lastReason = new Map<string, string | null>();
  for (const r of latest) if (!lastReason.has(`${r.targetType}:${r.targetId}`)) lastReason.set(`${r.targetType}:${r.targetId}`, r.reason);
  const counts = (s: string) => all.filter((x) => x.status === s).length;
  const list = all.filter((x) => x.status === status && (!type || x.target === type));
  const slice = list.slice((page - 1) * PAGE, page * PAGE);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const url = (over: Record<string, string | number>) => { const q = new URLSearchParams({ status, ...(type ? { type } : {}), ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, String(v)])) }); return lp(`/admin/scholarly?${q}`); };
  const i = locale === "ar" ? 0 : 1;
  const selected = sp.item ? all.find((x) => `${x.target}:${x.id}` === sp.item) : undefined;
  const history = selected ? await itemHistory(actor, selected.target as ScholarlyTarget, selected.id) : null;
  const who = (v: string | null) => (v === "demo-seed" ? t("اعتماد تجريبي، لا يحسب في الإنتاج", "Demo approval, does not count in production") : v ? names.get(v) ?? history?.nameOf[v] ?? v : "—");
  return (
    <>
      <PageHeader title={t("المراجعة العلمية", "Scholarly review")} subtitle={t("لا ينشر محتوى علمي إلا بعد اعتماد مختص.", "Scholarly content is published only after a specialist approves it.")} />
      <Section title={t("فروق نص المصحف بين المصدرين", "Mushaf text differences between sources")}>
        <Notice tone="warn">{t(`عند مقارنة النص المعتمد بمصدر مستقل ظهرت ${manifest.crossCheck.differences.length} فروق في هيكل الحروف أو الفواصل. يلزم أن يراجعها مختص بالرسم مقابل مصحف مطبوع قبل الإطلاق.`, `Comparing the stored text with an independent source shows ${manifest.crossCheck.differences.length} differences in letters or spacing. A script specialist must check them against a printed mushaf before launch.`)}</Notice>
        <p dir="ltr" className="text-start font-mono text-sm">{manifest.crossCheck.differences.join("  ·  ")}</p>
        <p className="mt-2 text-sm text-ink-2">{t(`توسيم التجويد: ${annotated} آية محاذاة، و${manifest.tajweed.unaligned} آية تعرض دون تلوين. التوسيم آلي المصدر.`, `Tajweed annotation: ${annotated} ayahs aligned, ${manifest.tajweed.unaligned} shown without colour. The annotation source is automated.`)}</p>
      </Section>
      <Notice>{t("لا ينفذ النظام أي اعتماد آلياً. غير المعتمد مخفي على مستوى الخادم، وأي تعديل يعيد المادة إلى الانتظار.", "The system never approves anything itself. Unapproved content is hidden on the server, and any edit returns it to the queue.")}</Notice>
      <nav aria-label={t("حالة المراجعة", "Review status")} className="mb-3 flex flex-wrap gap-1.5">
        {([["PENDING", "بانتظار المراجعة", "Waiting"], ["APPROVED", "معتمد", "Approved"], ["REJECTED", "مرفوض", "Rejected"]] as const).map(([k, ar, en]) => <Link key={k} aria-current={status === k ? "true" : undefined} className={`btn btn-sm ${status === k ? "btn-primary" : "btn-ghost"}`} href={lp(`/admin/scholarly?status=${k}${type ? `&type=${type}` : ""}`)}>{t(ar, en)} ({counts(k)})</Link>)}
      </nav>
      <nav aria-label={t("نوع المحتوى", "Content type")} className="mb-4 flex flex-wrap gap-1.5 text-sm">
        <Link aria-current={!type ? "true" : undefined} className={`btn btn-sm ${!type ? "btn-primary" : "btn-ghost"}`} href={lp(`/admin/scholarly?status=${status}`)}>{t("الكل", "All")}</Link>
        {Object.entries(TYPES).map(([k, v]) => <Link key={k} aria-current={type === k ? "true" : undefined} className={`btn btn-sm ${type === k ? "btn-primary" : "btn-ghost"}`} href={lp(`/admin/scholarly?status=${status}&type=${k}`)}>{v[i]}</Link>)}
      </nav>
      {selected && history && (
        <Section title={`${TYPES[selected.target][i]}: ${selected.title}`} actions={<Link className="btn btn-ghost btn-sm" href={url({ page })}>{t("إغلاق", "Close")}</Link>}>
          <p lang="ar" dir="rtl" className="mb-3 whitespace-pre-wrap rounded-lg bg-surface-2 p-3 leading-loose">{selected.text}</p>
          <dl className="mb-3 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="font-semibold">{t("المصدر", "Source")}</dt><dd>{selected.source}</dd></div>
            <div><dt className="font-semibold">{t("الترخيص", "Licence")}</dt><dd>{selected.license}</dd></div>
            <div><dt className="font-semibold">{t("الحالة", "Status")}</dt><dd><StatusBadge locale={locale} status={selected.status} /></dd></div>
            <div><dt className="font-semibold">{t("آخر مراجع وتاريخ", "Last reviewer and date")}</dt><dd>{who(selected.reviewedBy)}{selected.reviewedAt && ` · ${fmtDateTime(locale, selected.reviewedAt)}`}</dd></div>
          </dl>
          {selected.quotes && <Notice tone="warn">{t("فيه اقتباس قرآني محتمل، قابله بالمصحف", "Possible Quran quotation, compare with the mushaf")}: {selected.quotes}</Notice>}
          {selected.blocker === "grade" && <Notice tone="danger">{t("لا يعتمد قبل إضافة الدرجة ومرجعها.", "Cannot be approved before its grade and reference are added.")}</Notice>}
          {selected.blocker === "takhrij" && <Notice tone="danger">{t("لا يعتمد قبل إضافة التخريج.", "Cannot be approved before takhrij is added.")}</Notice>}
          <div className="mb-4 grid gap-4 md:grid-cols-2">
            <ActionForm path={`/scholarly/${selected.target}/${selected.id}`} transform="scholarly" submit={t("حفظ القرار", "Save decision")} fields={[
              { name: "decision", label: t("القرار", "Decision"), type: "select", required: true, options: [{ value: "approve", label: t("اعتماد", "Approve") }, { value: "reject", label: t("رفض", "Reject") }] },
              { name: "reason", label: t("السبب (إلزامي عند الرفض)", "Reason (required to reject)"), type: "textarea", full: true },
            ]} />
            <ActionForm path={`/scholarly/${selected.target}/${selected.id}/reviewer`} method="PUT" resetOnSuccess={false} submit={t("إسناد", "Assign")} fields={[
              { name: "reviewerId", label: t("المراجع المسؤول", "Responsible reviewer"), type: "select", required: true, defaultValue: history.assignment?.reviewerId, options: people.map((p) => ({ value: p.id, label: p.name })) },
            ]} />
          </div>
          <h3 className="mb-1 text-sm font-bold">{t("سجل المراجعة والتعديل", "Review and edit history")}</h3>
          {history.reviews.length + history.edits.length === 0 ? <p className="text-sm text-ink-2">{t("لا يوجد سجل بعد.", "No history yet.")}</p> : (
            <ul className="space-y-1 text-sm">
              {history.reviews.map((r) => <li key={r.id}>{fmtDateTime(locale, r.createdAt)}: <StatusBadge locale={locale} status={r.decision} /> {history.nameOf[r.reviewerId] ?? r.reviewerId}{r.reason && <>: {r.reason}</>} <span className="font-mono text-xs text-ink-2" dir="ltr">{r.contentSha.slice(0, 10)}</span></li>)}
              {history.edits.map((e) => <li key={e.id}>{fmtDateTime(locale, e.createdAt)}: {t("تعديل", "Edit")} ({e.action}) {history.nameOf[e.actorId ?? ""] ?? ""}</li>)}
            </ul>
          )}
        </Section>
      )}
      <Section title={t(`القائمة (${list.length})`, `Queue (${list.length})`)}>
        {slice.length === 0 ? <Empty title={t("لا يوجد محتوى بهذه الحالة.", "No content with this status.")} /> : (
          <Table caption={t("المحتوى", "Content")} columns={[t("النوع", "Type"), t("العنوان", "Title"), t("المصدر والترخيص", "Source and licence"), t("المراجع المسؤول", "Reviewer"), t("الاعتماد أو سبب الرفض", "Approval or rejection reason"), ""]}>
            {slice.map((x) => { const key = `${x.target}:${x.id}`; return <tr key={key}><td className="whitespace-nowrap">{TYPES[x.target][i]}</td><td><span lang="ar">{x.title}</span><span className="block max-w-sm truncate text-xs text-ink-2" lang="ar">{x.text.slice(0, 90)}</span></td><td className="max-w-xs text-xs"><span className="block truncate">{x.source}</span><span className="block truncate text-ink-2">{x.license}</span></td><td className="text-xs">{who(owner.get(key) ?? null)}</td><td className="text-xs">{x.status === "REJECTED" ? lastReason.get(key) ?? "—" : <>{who(x.reviewedBy)}{x.reviewedAt && <span className="block text-ink-2">{fmtDateTime(locale, x.reviewedAt)}</span>}</>}</td><td><Link className="btn btn-ghost btn-sm" href={url({ page, item: key })}>{t("مراجعة", "Review")}</Link></td></tr>; })}
          </Table>
        )}
        {pages > 1 && <nav className="mt-3 flex items-center justify-between text-sm" aria-label={t("الصفحات", "Pages")}><span className="text-ink-2">{t(`صفحة ${page} من ${pages}`, `Page ${page} of ${pages}`)}</span><span className="flex gap-1.5">{page > 1 && <Link className="btn btn-ghost btn-sm" href={url({ page: page - 1 })}>{t("السابق", "Previous")}</Link>}{page < pages && <Link className="btn btn-ghost btn-sm" href={url({ page: page + 1 })}>{t("التالي", "Next")}</Link>}</span></nav>}
      </Section>
    </>
  );
}
