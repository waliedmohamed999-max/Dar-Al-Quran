"use client";
import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useI18n } from "../client";

export type GridColumn = { key: string; label: string; sortable?: boolean };
/** `sort` holds comparable values, and `cells` what is shown. Search reads `text`. */
export type GridRow = { id: string; text: string; sort: Record<string, string | number | null>; filter?: string; cells: Record<string, ReactNode> };

/** Search, one filter, sortable headers and paging, on the client, for lists the server already scoped. */
export function DataGrid({ caption, columns, rows, filterLabel, filterOptions, pageSize = 12, emptyText }: { caption: string; columns: GridColumn[]; rows: GridRow[]; filterLabel?: string; filterOptions?: { value: string; label: string }[]; pageSize?: number; emptyText: string }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(1);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = rows.filter((r) => (!term || r.text.toLowerCase().includes(term)) && (!filter || r.filter === filter));
    if (!sort) return list;
    return [...list].sort((a, b) => {
      const x = a.sort[sort.key], y = b.sort[sort.key];
      // Empty values stay last in both directions.
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ar")) * sort.dir;
    });
  }, [rows, q, filter, sort]);
  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const current = Math.min(page, pages);
  const slice = shown.slice((current - 1) * pageSize, current * pageSize);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1"><label className="label" htmlFor={`grid-q-${caption}`}>{t("بحث", "Search")}</label><input id={`grid-q-${caption}`} type="search" className="input" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        {filterOptions && <div><label className="label" htmlFor={`grid-f-${caption}`}>{filterLabel}</label><select id={`grid-f-${caption}`} className="input" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}><option value="">{t("الكل", "All")}</option>{filterOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>}
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <caption className="sr-only">{caption}</caption>
          <thead><tr>{columns.map((c) => {
            const active = sort?.key === c.key;
            return <th key={c.key} scope="col" aria-sort={active ? (sort!.dir === 1 ? "ascending" : "descending") : undefined}>{c.sortable ? <button type="button" className="inline-flex items-center gap-1 font-bold" onClick={() => setSort(active ? { key: c.key, dir: sort!.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 })}>{c.label}{active && (sort!.dir === 1 ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />)}</button> : c.label}</th>;
          })}</tr></thead>
          <tbody>
            {slice.length === 0 && <tr><td colSpan={columns.length} className="py-8 text-center text-ink-2">{rows.length === 0 ? emptyText : t("لا توجد نتائج مطابقة.", "No matching results.")}</td></tr>}
            {slice.map((r) => <tr key={r.id}>{columns.map((c) => <td key={c.key}>{r.cells[c.key]}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
      {shown.length > pageSize && (
        <nav className="mt-3 flex items-center justify-between gap-2 text-sm" aria-label={t("التنقل بين الصفحات", "Pagination")}>
          <span className="text-ink-2">{t(`${shown.length} نتيجة، صفحة ${current} من ${pages}`, `${shown.length} results, page ${current} of ${pages}`)}</span>
          <span className="flex gap-1.5"><button type="button" className="btn btn-ghost btn-sm" disabled={current === 1} onClick={() => setPage(current - 1)}>{t("السابق", "Previous")}</button><button type="button" className="btn btn-ghost btn-sm" disabled={current === pages} onClick={() => setPage(current + 1)}>{t("التالي", "Next")}</button></span>
        </nav>
      )}
    </div>
  );
}
