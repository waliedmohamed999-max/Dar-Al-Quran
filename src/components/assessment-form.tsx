"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { callApi, useI18n } from "./client";

type Q = { id: string; type: string; promptAr: string; promptEn: string | null; options: { key: string; textAr: string; textEn?: string }[] | null; points: number };

export function AssessmentForm({ id, questions, backHref }: { id: string; questions: Q[]; backHref: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setErr(null);
    try {
      await callApi(`/assessments/${id}/submit`, "POST", {
        answers: questions.map((q) => q.type === "MULTIPLE_CHOICE" ? { questionId: q.id, selectedKey: f.get(q.id) ?? undefined } : { questionId: q.id, textAnswer: f.get(q.id) ?? undefined }),
      });
      router.push(backHref);
      router.refresh();
    } catch {
      setErr(t("تعذر التسليم، حاول مرة أخرى.", "Could not submit, please try again."));
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      {questions.map((q, i) => {
        const prompt = locale === "en" && q.promptEn ? q.promptEn : q.promptAr;
        return (
          <fieldset key={q.id} className="card">
            <legend className="px-1 font-semibold">{i + 1}. {prompt}</legend>
            {q.type === "MULTIPLE_CHOICE" ? (
              <div className="mt-2 space-y-1">
                {q.options?.map((o) => (
                  <label key={o.key} className="flex min-h-11 items-center gap-2 rounded-md px-2 hover:bg-surface-2">
                    <input type="radio" name={q.id} value={o.key} required className="size-5" />
                    <span>{locale === "en" && o.textEn ? o.textEn : o.textAr}</span>
                  </label>
                ))}
              </div>
            ) : (
              <>
                <label htmlFor={q.id} className="sr-only">{prompt}</label>
                <textarea id={q.id} name={q.id} rows={4} required className="input mt-2" />
                <p className="mt-1 text-xs text-ink-2">{t("يراجع معلمك هذه الإجابة ويقيمها بنفسه.", "Your teacher reviews and grades this answer.")}</p>
              </>
            )}
          </fieldset>
        );
      })}
      {err && <p role="alert" className="text-danger">{err}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? t("جارٍ التسليم…", "Submitting…") : t("تسليم الإجابات", "Submit answers")}</button>
    </form>
  );
}
