// Server-safe dashboard building blocks.
import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function Kpi({ icon: Icon, label, value, hint, href }: { icon: LucideIcon; label: string; value: ReactNode; hint?: string; href?: string }) {
  const body = (
    <div className="kpi">
      <span className="kpi-icon"><Icon className="size-5" aria-hidden="true" /></span>
      <div className="min-w-0"><p className="truncate text-xs font-semibold text-ink-2">{label}</p><p className="kpi-value">{value}</p>{hint && <p className="mt-0.5 text-xs text-ink-2">{hint}</p>}</div>
    </div>
  );
  return href ? <Link href={href} className="card block no-underline hover:border-ink-2">{body}</Link> : <div className="card">{body}</div>;
}

export const KpiGrid = ({ children }: { children: ReactNode }) => <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;

export function Panel({ title, hint, actions, children, className = "" }: { title: string; hint?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card min-w-0 ${className}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-bold">{title}</h2>{hint && <p className="text-xs text-ink-2">{hint}</p>}</div>{actions}</div>
      {children}
    </section>
  );
}

export function ActionRow({ href, label, count, icon: Icon }: { href: string; label: string; count: number; icon: LucideIcon }) {
  return <li><Link href={href} className="action-row text-sm"><span className="flex min-w-0 items-center gap-2"><Icon className="size-4 flex-none text-ink-2" aria-hidden="true" /><span className="truncate">{label}</span></span><span className="count-pill" data-hot={count > 0}>{count}</span></Link></li>;
}

export const SkeletonBlock = ({ h = "h-32" }: { h?: string }) => <div className={`dash-skeleton ${h}`} aria-hidden="true" />;
