import { RegisterForm } from "@/components/auth-forms";
import { pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "حساب جديد | Register", robots: { index: false } };

export default async function Register({ params }: PageParams) {
  const { t } = await pageCtx(params);
  return <div className="mx-auto max-w-md px-4 py-12"><h1 className="mb-5 text-center text-3xl text-brand">{t("حساب جديد", "Create account")}</h1><div className="card"><RegisterForm /></div></div>;
}
