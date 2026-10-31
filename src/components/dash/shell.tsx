"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Award, Bell, BookMarked, BookOpen, Bot, BookText, CalendarCheck, ChevronDown, CircleUserRound, ClipboardList, FileQuestion, FileText, FolderCog, Gavel, Globe, GraduationCap, HandHeart, LayoutDashboard, Library, Link2, ListChecks, LogOut, Map, Menu, MessageSquare, Mic, MonitorPlay, PanelRightClose, PanelRightOpen, Scale, ScrollText, Search, Settings, ShieldCheck, Users, UsersRound, Video, X, type LucideIcon,
} from "lucide-react";
import { authClient } from "../auth-forms";
import { ThemeToggle, useI18n } from "../client";
import type { NavGroup, NavIcon } from "./nav";

const ICONS: Record<NavIcon, LucideIcon> = {
  home: LayoutDashboard, users: Users, circle: UsersRound, link: Link2, programs: GraduationCap, book: Library, level: Scale, tasks: ListChecks, tajweed: BookText, hadith: ScrollText,
  questions: FileQuestion, exam: ClipboardList, judge: Gavel, cert: Award, report: FileText, content: FolderCog, review: ShieldCheck, mushaf: BookOpen, adhkar: HandHeart, site: Globe,
  ai: Bot, live: Video, bell: Bell, template: MessageSquare, audit: CalendarCheck, settings: Settings, map: Map, message: MessageSquare, account: CircleUserRound, children: UsersRound, recite: Mic, study: BookMarked,
};
void MonitorPlay;

/** Removes the /en prefix, so items compare against one path form. */
const strip = (p: string) => p.replace(/^\/en(?=\/|$)/, "") || "/";

/** The most specific item wins, so /admin/users does not also light /admin. */
function activeHref(groups: NavGroup[], path: string) {
  const all = groups.flatMap((g) => g.items.map((i) => i.href));
  return all.filter((h) => path === h || path.startsWith(`${h}/`)).sort((a, b) => b.length - a.length)[0] ?? null;
}

function Brand({ collapsed }: { collapsed: boolean }) {
  const { t, lp } = useI18n();
  return (
    <Link href={lp("/dashboard")} className="flex min-h-14 items-center gap-2.5 px-4 no-underline">
      <svg viewBox="0 0 40 40" className="size-8 flex-none" aria-hidden="true"><rect width="40" height="40" rx="9" fill="#d9c98f" /><path d="M20 7l4 5h6v6l4 2-4 2v6h-6l-4 5-4-5h-6v-6l-4-2 4-2v-6h6z" fill="#0a3d32" /></svg>
      {!collapsed && <span className="min-w-0 leading-tight"><span className="block truncate text-sm font-bold">{t("دار القرآن الكريم", "Dar Al-Quran")}</span><span className="block truncate text-xs" style={{ color: "var(--side-ink-2)" }}>{t("منصة الإدارة والتعليم", "Learning management")}</span></span>}
    </Link>
  );
}

function SideContent({ groups, collapsed, onNavigate }: { groups: NavGroup[]; collapsed: boolean; onNavigate?: () => void }) {
  const { t, lp } = useI18n();
  const path = strip(usePathname());
  const active = activeHref(groups, path);
  const [q, setQ] = useState("");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  useEffect(() => {
    try { setClosed(new Set(JSON.parse(localStorage.getItem("dash.groups") ?? "[]"))); } catch { /* the default is all open */ }
  }, []);
  const toggle = (id: string) => {
    const next = new Set(closed);
    if (next.has(id)) next.delete(id); else next.add(id);
    setClosed(next);
    localStorage.setItem("dash.groups", JSON.stringify([...next]));
  };
  const term = q.trim().toLowerCase();
  const visible = term ? groups.map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(term)) })).filter((g) => g.items.length) : groups;
  return (
    <>
      {!collapsed && (
        <div className="px-3 pb-2">
          <label className="sr-only" htmlFor="side-search">{t("بحث في القائمة", "Search the menu")}</label>
          <input id="side-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("بحث في القائمة…", "Search the menu…")} />
        </div>
      )}
      <nav className="dash-nav" aria-label={t("لوحة التحكم", "Dashboard")}>
        {visible.length === 0 && <p className="px-2 py-4 text-sm" style={{ color: "var(--side-ink-2)" }}>{t("لا توجد نتائج.", "No results.")}</p>}
        {visible.map((g) => {
          // A section holding the current page stays open, so the highlight is never hidden.
          const open = collapsed || Boolean(term) || !closed.has(g.id) || g.items.some((i) => i.href === active);
          return (
            <div key={g.id} className="mb-1.5">
              {!collapsed && <button type="button" className="dash-group-h" aria-expanded={open} onClick={() => toggle(g.id)}>{g.title}<ChevronDown className={`size-3.5 transition-transform ${open ? "" : "rotate-90"}`} aria-hidden="true" /></button>}
              {open && (
                <ul className="space-y-0.5">
                  {g.items.map((i) => {
                    const Icon = ICONS[i.icon];
                    return <li key={`${g.id}${i.href}`}><Link className={`dash-link ${collapsed ? "justify-center" : ""}`} href={lp(i.href)} aria-current={i.href === active ? "page" : undefined} title={collapsed ? i.label : undefined} aria-label={collapsed ? i.label : undefined} onClick={onNavigate}><Icon className="size-[18px] flex-none" aria-hidden="true" />{!collapsed && <span className="truncate">{i.label}</span>}</Link></li>;
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
    </>
  );
}

function Breadcrumbs({ groups }: { groups: NavGroup[] }) {
  const { t, lp } = useI18n();
  const path = strip(usePathname());
  const href = activeHref(groups, path);
  const group = groups.find((g) => g.items.some((i) => i.href === href));
  const item = group?.items.find((i) => i.href === href);
  return (
    <nav aria-label={t("مسار التنقل", "Breadcrumb")} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        <li className="hidden truncate text-ink-2 sm:block">{group?.title ?? t("اللوحة", "Dashboard")}</li>
        {item && <li className="hidden text-ink-2 sm:block" aria-hidden="true">/</li>}
        {item && <li className="truncate font-semibold">{path === href ? item.label : <Link className="hover:underline" href={lp(item.href)}>{item.label}</Link>}</li>}
        {item && path !== href && <><li className="text-ink-2" aria-hidden="true">/</li><li className="truncate text-ink-2" aria-current="page">{t("التفاصيل", "Details")}</li></>}
      </ol>
    </nav>
  );
}

/** Jumps to any page the account may open. Results come from the same permitted list as the sidebar. */
function QuickSearch({ groups }: { groups: NavGroup[] }) {
  const { t, lp } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const items = useMemo(() => {
    const seen = new Set<string>();
    return groups.flatMap((g) => g.items).filter((i) => { if (seen.has(i.href)) return false; seen.add(i.href); return true; });
  }, [groups]);
  const results = q.trim() ? items.filter((i) => i.label.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); input.current?.focus(); } };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <form role="search" className="relative hidden w-64 md:block" onSubmit={(e) => { e.preventDefault(); if (results[0]) { router.push(lp(results[0].href)); setQ(""); setOpen(false); } }}>
      <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-2" aria-hidden="true" />
      <label className="sr-only" htmlFor="quick-search">{t("انتقال سريع إلى صفحة", "Jump to a page")}</label>
      <input ref={input} id="quick-search" type="search" className="input ps-8" placeholder={t("انتقال سريع (Ctrl+K)", "Jump to… (Ctrl+K)")} value={q} autoComplete="off" onChange={(e) => { setQ(e.target.value); setOpen(true); }} onBlur={() => setTimeout(() => setOpen(false), 150)} onFocus={() => setOpen(true)} onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); setOpen(false); } }} />
      {open && q.trim() && (
        <ul className="absolute inset-x-0 top-full z-40 mt-1 rounded-lg border border-line bg-surface p-1 shadow-lg">
          {results.length === 0 && <li className="px-2 py-1.5 text-sm text-ink-2">{t("لا توجد صفحة بهذا الاسم.", "No page by that name.")}</li>}
          {results.map((r) => <li key={r.href}><Link className="block rounded px-2 py-1.5 text-sm hover:bg-surface-2" href={lp(r.href)} onClick={() => { setQ(""); setOpen(false); }}>{r.label}</Link></li>)}
        </ul>
      )}
    </form>
  );
}

function ProfileMenu({ name, role }: { name: string; role: string }) {
  const { t, lp } = useI18n();
  const router = useRouter();
  return (
    <details className="relative">
      <summary className="btn btn-ghost btn-sm cursor-pointer list-none" aria-label={t("حسابي", "My account")}><CircleUserRound className="size-4" aria-hidden="true" /><span className="hidden max-w-32 truncate xl:inline">{name}</span></summary>
      <div className="absolute end-0 top-full z-40 mt-1 w-56 rounded-lg border border-line bg-surface p-2 shadow-lg">
        <p className="truncate px-2 text-sm font-semibold">{name}</p>
        <p className="mb-1 truncate px-2 text-xs text-ink-2">{role}</p>
        <Link className="block rounded px-2 py-1.5 text-sm hover:bg-surface-2" href={lp("/account")}>{t("الحساب والخصوصية", "Account and privacy")}</Link>
        <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-sm hover:bg-surface-2" onClick={async () => { await authClient.signOut(); router.push(lp("/")); router.refresh(); }}><LogOut className="size-4" aria-hidden="true" />{t("خروج", "Sign out")}</button>
      </div>
    </details>
  );
}

export function DashShell({ groups, name, role, unread, initialCollapsed, children }: { groups: NavGroup[]; name: string; role: string; unread: number; initialCollapsed: boolean; children: ReactNode }) {
  const { t, lp } = useI18n();
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [drawer, setDrawer] = useState(false);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const toggle = () => {
    const v = !collapsed;
    setCollapsed(v);
    // A cookie, so the server renders the saved width and the layout does not jump on load.
    document.cookie = `dash_sidebar=${v ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  };
  useEffect(() => setDrawer(false), [path]);
  useEffect(() => {
    if (!drawer) return;
    closeBtn.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setDrawer(false); menuBtn.current?.focus(); } };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); document.body.style.overflow = ""; };
  }, [drawer]);
  const Collapse = collapsed ? PanelRightOpen : PanelRightClose;
  return (
    <div data-surface="dash">
      <div className="dash-shell" data-collapsed={collapsed}>
        <aside className="dash-side no-print" aria-label={t("القائمة الجانبية", "Sidebar")}>
          <Brand collapsed={collapsed} />
          <SideContent groups={groups} collapsed={collapsed} />
          <button type="button" className="dash-group-h border-t border-white/10 !min-h-11 !rounded-none" style={{ justifyContent: collapsed ? "center" : "flex-start" }} aria-pressed={collapsed} aria-label={collapsed ? t("توسيع القائمة", "Expand the menu") : t("طي القائمة", "Collapse the menu")} onClick={toggle}><Collapse className="size-4 rtl:rotate-0 ltr:rotate-180" aria-hidden="true" />{!collapsed && t("طي القائمة", "Collapse the menu")}</button>
        </aside>
        {drawer && (
          <>
            <div className="dash-drawer-scrim lg:hidden" onClick={() => setDrawer(false)} aria-hidden="true" />
            <aside className="dash-side dash-drawer lg:hidden" role="dialog" aria-modal="true" aria-label={t("القائمة", "Menu")}>
              <div className="flex items-center justify-between pe-2"><Brand collapsed={false} /><button ref={closeBtn} type="button" className="inline-flex size-10 items-center justify-center rounded-lg" aria-label={t("إغلاق القائمة", "Close the menu")} onClick={() => { setDrawer(false); menuBtn.current?.focus(); }}><X className="size-5" aria-hidden="true" /></button></div>
              <SideContent groups={groups} collapsed={false} onNavigate={() => setDrawer(false)} />
            </aside>
          </>
        )}
        <div className="min-w-0">
          <header className="dash-top no-print">
            <div className="flex min-h-14 items-center justify-between gap-2 px-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-2">
                <button ref={menuBtn} type="button" className="btn btn-ghost btn-sm lg:hidden" aria-label={t("فتح القائمة", "Open the menu")} aria-expanded={drawer} onClick={() => setDrawer(true)}><Menu className="size-5" aria-hidden="true" /></button>
                <Breadcrumbs groups={groups} />
              </div>
              <div className="flex flex-none items-center gap-1.5">
                <QuickSearch groups={groups} />
                <Link href={lp("/")} className="btn btn-ghost btn-sm hidden sm:inline-flex" aria-label={t("العودة للموقع العام", "Back to the public site")}><Globe className="size-4" aria-hidden="true" /><span className="hidden xl:inline">{t("الموقع العام", "Public site")}</span></Link>
                <Link href={lp("/notifications")} className="btn btn-ghost btn-sm" aria-label={unread ? t(`الإشعارات: ${unread} غير مقروءة`, `Notifications: ${unread} unread`) : t("الإشعارات", "Notifications")}><Bell className="size-4" aria-hidden="true" />{unread > 0 && <span className="count-pill" data-hot="true">{unread > 99 ? "99+" : unread}</span>}</Link>
                <ThemeToggle />
                <ProfileMenu name={name} role={role} />
              </div>
            </div>
          </header>
          <main id="main" className="mx-auto min-w-0 max-w-[1320px] px-3 py-5 sm:px-5 sm:py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
