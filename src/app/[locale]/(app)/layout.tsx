import { cookies } from "next/headers";
import { DashShell } from "@/components/dash/shell";
import { dashNav } from "@/components/dash/nav";
import { AdhkarToast } from "@/components/v3";
import { withActor } from "@/lib/db";
import { guard, pageCtx, type PageParams } from "@/lib/page";
import { ROLE_NAMES } from "@/lib/rbac";
import "../../dashboard.css";

export default async function AppLayout({ children, params }: PageParams & { children: React.ReactNode }) {
  const { locale, t } = await pageCtx(params);
  // Pages enforce the second factor themselves, because the setup page renders inside this layout.
  const actor = await guard(locale, undefined, { mfaExempt: true });
  const [unread, jar] = await Promise.all([withActor(actor, (tx) => tx.notification.count({ where: { userId: actor.id, readAt: null } })), cookies()]);
  return (
    <DashShell groups={dashNav(actor, t)} name={actor.name} role={actor.roles.map((r) => ROLE_NAMES[r.key][locale]).join("، ")} unread={unread} initialCollapsed={jar.get("dash_sidebar")?.value === "collapsed"}>
      {children}
      <AdhkarToast />
    </DashShell>
  );
}
