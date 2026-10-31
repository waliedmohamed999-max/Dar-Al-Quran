import { ActionButton, ActionForm } from "@/components/client";
import { Empty, PageHeader, Section, StatusBadge, Table } from "@/components/ui";
import { withActor } from "@/lib/db";
import { guard, pageCtx, type PageParams, type SearchProps } from "@/lib/page";
import { ROLE_NAMES, ROLES, type RoleKey } from "@/lib/rbac";

export const metadata = { title: "المستخدمون | Users", robots: { index: false } };

export default async function Users({ params, searchParams }: PageParams & SearchProps) {
  const { locale, t } = await pageCtx(params);
  const actor = await guard(locale, "users.manage");
  const q = (await searchParams).q?.trim();
  const users = await withActor(actor, (tx) => tx.user.findMany({
      where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {},
      orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, name: true, email: true, status: true, isDemo: true, roles: { select: { role: { select: { key: true } } } } },
  }));
  const canAssign = actor.perms.has("roles.assign");
  const roleOpts = ROLES.filter((r) => canAssign || !["super_admin", "admin", "supervisor"].includes(r)).map((r) => ({ value: r, label: ROLE_NAMES[r][locale] }));
  return (
    <>
      <PageHeader title={t("المستخدمون والصلاحيات", "Users and permissions")} />
      <Section title={t("إنشاء حساب", "Create account")}>
        <p className="mb-3 text-sm text-ink-2">{t("يصل المستخدم رابط لتعيين كلمة مروره. الأدوار الإدارية يسندها المدير العام فقط.", "The user receives a link to set their password. Only a Super Admin assigns administrative roles.")}</p>
        <ActionForm path="/users" submit={t("إنشاء", "Create")} fields={[
          { name: "name", label: t("الاسم", "Name"), required: true },
          { name: "email", label: t("البريد", "Email"), type: "email", required: true },
          { name: "role", label: t("الدور", "Role"), type: "select", required: true, options: roleOpts },
        ]} />
      </Section>
      <Section title={t("الحسابات", "Accounts")}>
        <form className="mb-3 flex gap-2" role="search">
          <label htmlFor="q" className="sr-only">{t("بحث", "Search")}</label>
          <input id="q" name="q" defaultValue={q} className="input" placeholder={t("اسم أو بريد", "Name or email")} />
          <button className="btn btn-ghost">{t("بحث", "Search")}</button>
        </form>
        {users.length === 0 ? <Empty title={t("لا توجد نتائج.", "No results.")} /> : (
          <Table caption={t("المستخدمون", "Users")} columns={[t("الاسم", "Name"), t("البريد", "Email"), t("الأدوار", "Roles"), t("الحالة", "Status"), t("إجراءات", "Actions")]}>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}{u.isDemo && <span className="ms-1 text-xs text-warn">{t("(تجريبي)", "(demo)")}</span>}</td>
                <td dir="ltr" className="text-start">{u.email}</td>
                <td>{u.roles.map((r) => ROLE_NAMES[r.role.key as RoleKey]?.[locale] ?? r.role.key).join("، ")}</td>
                <td><StatusBadge locale={locale} status={u.status} /></td>
                <td>
                  {u.id !== actor.id && (u.status === "ACTIVE"
                    ? <ActionButton path={`/users/${u.id}/status`} method="PUT" body={{ status: "SUSPENDED" }} label={t("إيقاف", "Suspend")} variant="danger" confirm={t("إيقاف الحساب وإنهاء جلساته؟", "Suspend this account and end its sessions?")} />
                    : <ActionButton path={`/users/${u.id}/status`} method="PUT" body={{ status: "ACTIVE" }} label={t("تفعيل", "Activate")} />)}
                  {canAssign && u.id !== actor.id && (
                    <details className="mt-1"><summary className="cursor-pointer text-xs underline">{t("منح دور", "Grant role")}</summary>
                      <ActionForm path={`/users/${u.id}/roles`} submit={t("حفظ", "Save")} transform="grantRole" fields={[
                        { name: "role", label: t("الدور", "Role"), type: "select", required: true, options: roleOpts },
                                    ]} />
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </>
  );
}
