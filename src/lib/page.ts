import { notFound, redirect } from "next/navigation";
import { isLocale, localePath, translator, type Locale } from "./i18n";
import type { Permission } from "./rbac";
import { getActor, mfaIsRequired, type Actor } from "./session";

export { mfaIsRequired };

export type PageParams<T = object> = { params: Promise<{ locale: string } & T> };
export type SearchProps = { searchParams: Promise<Record<string, string | undefined>> };

export async function pageCtx(params: Promise<{ locale: string }>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { locale: locale as Locale, t: translator(locale), lp: (p: string) => localePath(locale, p) };
}

/** Page guard. API routes and RLS enforce the same rules independently. */
export async function guard(locale: Locale, perm?: Permission, opts: { mfaExempt?: boolean } = {}): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect(localePath(locale, "/login"));
  if (!opts.mfaExempt && mfaIsRequired(actor) && !actor.twoFactorEnabled) redirect(localePath(locale, "/account/security"));
  if (perm && !actor.perms.has(perm)) notFound();
  return actor;
}
