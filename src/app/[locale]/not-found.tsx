"use client";
import Link from "next/link";
import { useI18n } from "@/components/client";

export default function NotFound() {
  const { t, lp } = useI18n();
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-3xl text-brand">{t("الصفحة غير موجودة", "Page not found")}</h1>
      <p className="mt-2 text-ink-2">{t("قد يكون الرابط غير صحيح، أو لا تملك صلاحية عرض هذه الصفحة.", "The link may be wrong, or you may not have permission to view this page.")}</p>
      <Link className="btn btn-primary mt-5" href={lp("/")}>{t("الرئيسية", "Home")}</Link>
    </main>
  );
}
