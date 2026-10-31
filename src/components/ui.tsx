import Link from "next/link";
import type { ReactNode } from "react";
import { label, type Locale } from "@/lib/i18n";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-4xl font-bold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-2">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card mb-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label: name, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card">
      <div className="text-sm text-ink-2">{name}</div>
      <div className="mt-1 text-4xl font-bold text-ink">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-2">{hint}</div>}
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-4 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {hint && <p className="mt-1 text-sm text-ink-2">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "danger"; children: ReactNode }) {
  const color = tone === "danger" ? "border-danger text-danger" : tone === "warn" ? "border-warn text-warn" : "border-ink text-ink";
  return <div role={tone === "danger" ? "alert" : "note"} className={`mb-4 rounded-lg border-s-4 bg-surface-2 px-4 py-2 text-sm ${color}`}>{children}</div>;
}

export function StatusBadge({ locale, status }: { locale: Locale; status: string }) {
  const good = ["DONE", "ACTIVE", "APPROVED", "PRESENT", "ISSUED", "PUBLISHED", "HELD", "GRADED"].includes(status);
  const bad = ["REJECTED", "ABSENT", "REVOKED", "SUSPENDED", "CANCELLED"].includes(status);
  const cls = good ? "border-ok bg-ok/10 text-ok" : bad ? "border-danger bg-danger/10 text-danger" : "border-transparent bg-surface-2 text-ink-2";
  return <span className={`inline-block whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold ${cls}`}>{label(locale, status)}</span>;
}

/** Wide tables scroll in their own region so the page never scrolls sideways on phones. */
export function Table({ columns, children, caption }: { columns: string[]; children: ReactNode; caption: string }) {
  return (
    <div className="table-wrap overflow-x-auto" tabIndex={0} role="region" aria-label={caption}>
      <table className="tbl">
        <caption className="sr-only">{caption}</caption>
        <thead><tr>{columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const LinkButton = ({ href, children, variant = "ghost" }: { href: string; children: ReactNode; variant?: "primary" | "ghost" | "gold" }) => (
  <Link href={href} className={`btn btn-${variant}`}>{children}</Link>
);

export function Progress({ value, label: name }: { value: number | null; label: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm"><span>{name}</span><span className="font-semibold">{value === null ? "—" : `${value}%`}</span></div>
      <div className="h-2 rounded-full bg-surface-2" role="progressbar" aria-label={name} aria-valuenow={value ?? 0} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-2 rounded-full bg-brand" style={{ width: `${value ?? 0}%` }} />
      </div>
    </div>
  );
}
 