import { ForgotForm } from "@/components/auth-forms";
import { pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "استعادة كلمة المرور | Reset password", robots: { index: false } };

export default async function Forgot({ params }: PageParams) {
  const { t } = await pageCtx(params);
  return <div className="mx-auto max-w-md px-4 py-12"><h1 className="mb-5 text-center text-3xl text-brand">{t("استعادة كلمة المرور", "Reset password")}</h1><div className="card"><ForgotForm /></div></div>;
}
