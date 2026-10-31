"use client";
import { useI18n } from "@/components/client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-3xl text-brand">{t("حدث خطأ غير متوقع", "Something went wrong")}</h1>
      <p className="mt-2 text-ink-2">{t("لم تفقد بياناتك. حاول مرة أخرى بعد لحظات.", "Your data is safe. Please try again in a moment.")}</p>
      <button type="button" className="btn btn-primary mt-5" onClick={reset}>{t("إعادة المحاولة", "Try again")}</button>
    </main>
  );
}
