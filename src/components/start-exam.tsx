"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi, useI18n } from "./client";

export function StartExam({ competitionId, hrefBase }: { competitionId: string; hrefBase: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span>
      <button type="button" className="btn btn-primary" onClick={() => callApi(`/competitions/${competitionId}/start`, "POST").then((a) => router.push(`${hrefBase}/${a.id}`)).catch((e) => setErr((e as { code?: string }).code === "no_attempts_left" ? t("استنفدت المحاولات.", "No attempts left.") : t("تعذر البدء.", "Could not start.")))}>{t("بدء الاختبار أو استئنافه", "Start or resume the exam")}</button>
      {err && <span role="alert" className="ms-2 text-sm text-danger">{err}</span>}
    </span>
  );
}
