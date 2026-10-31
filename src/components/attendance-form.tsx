"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { callApi, useI18n } from "./client";

const OPTIONS = [["PRESENT", "حاضر", "Present"], ["LATE", "متأخر", "Late"], ["ABSENT", "غائب", "Absent"], ["EXCUSED", "إجازة", "Excused"]];

export function AttendanceForm({ sessionId, students }: { sessionId: string; students: { id: string; name: string; status: string | null }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await callApi(`/sessions/${sessionId}/attendance`, "POST", { records: students.map((s) => ({ studentId: s.id, status: f.get(s.id) })) });
      setMsg({ ok: true, text: t("تم حفظ الحضور.", "Attendance saved.") });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: t("تعذر الحفظ.", "Could not save.") });
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      {students.map((s) => (
        <fieldset key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
          <legend className="float-start font-semibold">{s.name}</legend>
          <div className="flex flex-wrap gap-3">
            {OPTIONS.map(([v, ar, en]) => (
              <label key={v} className="flex min-h-11 items-center gap-1.5 text-sm"><input type="radio" className="size-4" name={s.id} value={v} defaultChecked={(s.status ?? "PRESENT") === v} />{t(ar, en)}</label>
            ))}
          </div>
        </fieldset>
      ))}
      <button className="btn btn-primary">{t("حفظ الحضور", "Save attendance")}</button>
      <span aria-live="polite" className={`ms-3 text-sm ${msg?.ok ? "text-ok" : "text-danger"}`}>{msg?.text}</span>
    </form>
  );
}
