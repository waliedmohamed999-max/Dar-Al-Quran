"use client";
// Small SVG charts: no chart library, so dashboards stay light. Single measure per axis, thin marks,
// hover tooltips, and every chart offers its numbers as a table.
import { useId, useRef, useState } from "react";
import { useI18n } from "../client";

export type Point = { label: string; value: number | null };
type Series = { name: string; points: Point[]; color: string };

const W = 640, H = 220, PAD = { t: 12, r: 12, b: 26, l: 36 };

function DataTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  const { t } = useI18n();
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-ink-2">{t("عرض الأرقام", "Show the numbers")}</summary>
      <div className="table-wrap mt-1 max-h-48 overflow-y-auto"><table className="tbl"><thead><tr>{columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody></table></div>
    </details>
  );
}

function Legend({ series }: { series: { name: string; color: string }[] }) {
  if (series.length < 2) return null;
  return <ul className="mb-1 flex flex-wrap gap-3 text-xs text-ink-2">{series.map((s) => <li key={s.name} className="flex items-center gap-1.5"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: s.color }} aria-hidden="true" />{s.name}</li>)}</ul>;
}

/** Lines for change over time. Null values leave a gap: no data is not zero. */
export function LineChart({ series, max, unit = "", label, emptyText }: { series: Series[]; max?: number; unit?: string; label: string; emptyText: string }) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const titleId = useId();
  const n = series[0]?.points.length ?? 0;
  const values = series.flatMap((s) => s.points.map((p) => p.value)).filter((v): v is number => v !== null);
  if (!values.length) return <p className="py-10 text-center text-sm text-ink-2">{emptyText}</p>;
  const top = max ?? Math.max(1, Math.ceil(Math.max(...values) * 1.15));
  const x = (i: number) => PAD.l + (n <= 1 ? (W - PAD.l - PAD.r) / 2 : (i * (W - PAD.l - PAD.r)) / (n - 1));
  const y = (v: number) => H - PAD.b - (v / top) * (H - PAD.t - PAD.b);
  const ticks = [0, top / 2, top];
  const every = Math.max(1, Math.ceil(n / 7));
  const path = (pts: Point[]) => { let d = ""; let pen = false; pts.forEach((p, i) => { if (p.value === null) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`; pen = true; }); return d; };
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - PAD.l) / Math.max(1, W - PAD.l - PAD.r)) * (n - 1))));
    const b = box.current!.getBoundingClientRect();
    setHover({ i, x: e.clientX - b.left, y: e.clientY - b.top });
  };
  return (
    <div ref={box} className="relative">
      <Legend series={series} />
      <div dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-labelledby={titleId} onPointerMove={move} onPointerLeave={() => setHover(null)}>
        <title id={titleId}>{label}</title>
        <g className="chart-grid">{ticks.map((v) => <line key={v} x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} strokeWidth="1" />)}</g>
        {ticks.map((v) => <text key={v} className="chart-axis" x={PAD.l - 6} y={y(v) + 4} textAnchor="end">{Math.round(v)}</text>)}
        {series[0].points.map((p, i) => (i % every === 0 ? <text key={i} className="chart-axis" x={x(i)} y={H - 8} textAnchor="middle">{p.label}</text> : null))}
        {hover && <line x1={x(hover.i)} x2={x(hover.i)} y1={PAD.t} y2={H - PAD.b} stroke="var(--ink-2)" strokeDasharray="3 3" />}
        {series.map((s) => <path key={s.name} d={path(s.points)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}
        {series.map((s) => s.points.map((p, i) => (p.value !== null && (n <= 14 || hover?.i === i || (s.points[i - 1]?.value ?? null) === null && (s.points[i + 1]?.value ?? null) === null) ? <circle key={`${s.name}${i}`} cx={x(i)} cy={y(p.value)} r={hover?.i === i ? 4.5 : 3} fill={s.color} stroke="var(--surface)" strokeWidth="2" /> : null)))}
      </svg>
      </div>
      {hover && <div className="chart-tip" style={{ left: hover.x, top: hover.y }}><strong>{series[0].points[hover.i].label}</strong>{series.map((s) => <div key={s.name}>{s.name}: {s.points[hover.i].value ?? t("لا بيانات", "no data")}{s.points[hover.i].value !== null ? unit : ""}</div>)}</div>}
      <DataTable columns={[t("الفترة", "Period"), ...series.map((s) => s.name)]} rows={series[0].points.map((p, i) => [p.label, ...series.map((s) => (s.points[i].value === null ? "—" : `${s.points[i].value}${unit}`))])} />
    </div>
  );
}

/** Horizontal bars for comparing categories. Labels sit in HTML, so Arabic renders and wraps correctly. */
export function BarList({ rows, unit = "", label, emptyText, color = "var(--chart-1)" }: { rows: { label: string; value: number; hint?: string }[]; unit?: string; label: string; emptyText: string; color?: string }) {
  const { t } = useI18n();
  if (!rows.length) return <p className="py-10 text-center text-sm text-ink-2">{emptyText}</p>;
  const top = Math.max(1, ...rows.map((r) => r.value));
  return (
    <figure aria-label={label}>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.label} title={r.hint ?? `${r.label}: ${r.value}${unit}`}>
            <div className="mb-1 flex justify-between gap-2 text-sm"><span className="truncate">{r.label}</span><span className="flex-none font-semibold tabular-nums">{r.value}{unit}</span></div>
            <div className="h-2 rounded-full bg-surface-2"><div className="h-2 rounded-full" style={{ width: `${(r.value / top) * 100}%`, background: color, minWidth: r.value ? 4 : 0 }} /></div>
          </li>
        ))}
      </ul>
      <span className="sr-only">{t("القيم مكتوبة بجانب كل صف.", "Values are written beside each row.")}</span>
    </figure>
  );
}
