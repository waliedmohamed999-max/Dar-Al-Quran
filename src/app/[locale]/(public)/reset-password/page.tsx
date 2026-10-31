import { Suspense } from "react";
import { ResetForm } from "@/components/auth-forms";
import { pageCtx, type PageParams } from "@/lib/page";

export const metadata = { title: "كلمة مرور جديدة | New password", robots: { index: false } };

export default async function Reset({ params }: PageParams) {
  const { t } = await pageCtx(params);
  return <div className="mx-auto max-w-md px-4 py-12"><h1 className="mb-5 text-center text-3xl text-brand">{t("كلمة مرور جديدة", "New password")}</h1><div className="card"><Suspense><ResetForm /></Suspense></div></div>;
}
