import { Empty, PageHeader, Section, Table } from "@/components/ui";
import { withActor } from "@/lib/db";
import { guard, pageCtx, type PageParams, type SearchProps } from "@/lib/page";
import { buildReport, reportFilter } from "@/modules/reports/service";

export const metadata = { title: "التقارير | Reports", robots: { index: false } };

export default async function Reports({ params, searchParams }: PageParams & SearchProps) {
  const { locale, t } = await pageCtx(params);
  const actor = await guard(locale, "reports.view");
  const sp = await searchParams;
  const clean = Object.fromEntries(Object.entries(sp).filter(([, v]) => v));
  const filter = reportFilter.parse({ type: "attendance", ...clean });
  const { halaqas, teachers } = await withActor(actor, async (tx) => ({
    halaqas: await tx.halaqa.findMany({ select: { id: true, name: true } }),
    teachers: await tx.teacher.findMany({ select: { id: true, user: { select: { name: true } } } }),
  }));
  const report = await buildReport(actor, filter);
  const qs = new URLSearchParams(clean as Record<string, string>);
  if (!qs.get("type")) qs.set("type", filter.type);
  const types = [["attendance", "الحضور", "Attendance"], ["tasks", "المهام", "Tasks"], ["reviews", "التقييمات", "Reviews"], ["students", "الطلاب", "Students"]];
  const select = (name: string, label: string, opts: { id: string; name: string }[]) => (
    <div>
      <label htmlFor={name} className="label">{label}</label>
      <select id={name} name={name} defaultValue={sp[name] ?? ""} className="input">
        <option value="">{t("الكل", "All")}</option>
        {opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  );
  return (
    <>
      <PageHeader title={t("التقارير", "Reports")} />
      <form className="card mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor="type" className="label">{t("التقرير", "Report")}</label>
          <select id="type" name="type" defaultValue={filter.type} className="input">{types.map(([v, ar, en]) => <option key={v} value={v}>{t(ar, en)}</option>)}</select>
        </div>
        <div><label htmlFor="from" className="label">{t("من", "From")}</label><input id="from" name="from" type="date" defaultValue={sp.from} className="input" /></div>
        <div><label htmlFor="to" className="label">{t("إلى", "To")}</label><input id="to" name="to" type="date" defaultValue={sp.to} className="input" /></div>
        {select("halaqaId", t("الحلقة", "Halaqa"), halaqas)}
        {select("teacherId", t("المعلم", "Teacher"), teachers.map((x) => ({ id: x.id, name: x.user.name })))}
        <div className="sm:col-span-2 lg:col-span-3"><button className="btn btn-primary">{t("عرض", "Show")}</button></div>
      </form>
      <Section
        title={t(`النتائج (${report.rows.length})`, `Results (${report.rows.length})`)}
        actions={actor.perms.has("reports.export") ? (
          <div className="flex gap-2">
            {["csv", "xlsx", "pdf"].map((f) => <a key={f} className="btn btn-ghost btn-sm" href={`/api/v1/reports/export?${qs.toString()}&format=${f}`}>{f.toUpperCase()}</a>)}
          </div>
        ) : undefined}
      >
        {report.rows.length === 0 ? <Empty title={t("لا توجد بيانات لهذه التصفية.", "No data for this filter.")} /> : (
          <Table caption={report.title} columns={report.columns}>
            {report.rows.slice(0, 200).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c ?? "—"}</td>)}</tr>)}
          </Table>
        )}
      </Section>
    </>
  );
}
