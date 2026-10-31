import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth-forms";
import { pageCtx, type PageParams } from "@/lib/page";
import { getActor } from "@/lib/session";

export const metadata = { title: "تسجيل الدخول | Sign in", robots: { index: false } };

export default async function Login({ params }: PageParams) {
  const { t, lp } = await pageCtx(params);
  if (await getActor()) redirect(lp("/dashboard"));
  return <div className="mx-auto max-w-md px-4 py-12"><h1 className="mb-5 text-center text-3xl text-brand">{t("تسجيل الدخول", "Sign in")}</h1><div className="card"><LoginForm /></div></div>;
}
