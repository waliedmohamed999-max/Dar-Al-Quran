"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

export function MobileMenu({ items, label, className }: { items: { href: string; label: string }[]; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className={className}>
      <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} aria-label={label} onClick={() => setOpen(!open)}>
        {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
      </button>
      {open && (
        <nav aria-label={label} className="absolute inset-x-0 top-full border-b border-line bg-surface p-3 shadow-lg">
          <ul className="grid gap-1 sm:grid-cols-2">
            {items.map((i) => <li key={i.href}><Link className="block rounded-md px-3 py-2.5 hover:bg-surface-2" href={i.href}>{i.label}</Link></li>)}
          </ul>
        </nav>
      )}
    </div>
  );
}
