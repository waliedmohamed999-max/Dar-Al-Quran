import Link from "next/link";
import { ActionButton } from "./client";
import { StatusBadge } from "./ui";
import { TASK_TYPES, type Locale, localePath, translator } from "@/lib/i18n";

type Task = {
  id: string; type: string; surahId: number | null; fromAyah: number | null; toAyah: number | null; ruleSlug: string | null;
  suggestedMinutes: number; status: string; teacherNote: string | null; carriedFromId: string | null;
};

/** Shared task board. Status buttons appear only when `editable`, and the API enforces the same. */
export function TaskList({ tasks, surahNames, locale, editable, tomorrow }: { tasks: Task[]; surahNames: Map<number, string>; locale: Locale; editable: boolean; tomorrow?: string }) {
  const t = translator(locale);
  const lp = (p: string) => localePath(locale, p);
  return (
    <ul className="space-y-2">
      {tasks.map((task) => {
        const open = ["PENDING", "IN_PROGRESS"].includes(task.status);
        return (
          <li key={task.id} className="rounded-xl border border-line p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{TASK_TYPES[task.type]?.[locale]}</h3>
                <p className="text-sm text-ink-2">
                  {task.surahId && `${surahNames.get(task.surahId)} (${task.fromAyah}${task.toAyah !== task.fromAyah ? `–${task.toAyah}` : ""})`}
                  {task.ruleSlug && <Link className="underline" href={lp(`/tajweed/${task.ruleSlug}`)}>{t("فتح الدرس", "Open lesson")}</Link>}
                  {" · "}{t(`${task.suggestedMinutes} دقيقة`, `${task.suggestedMinutes} min`)}
                  {task.carriedFromId && ` · ${t("مرحلة من يوم سابق", "Carried from an earlier day")}`}
                </p>
                {task.teacherNote && <p className="mt-1 rounded bg-surface-2 px-2 py-1 text-sm">{t("ملاحظة المعلم", "Teacher's note")}: {task.teacherNote}</p>}
              </div>
              <StatusBadge locale={locale} status={task.status} />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {task.surahId && <Link className="btn btn-ghost btn-sm" href={lp(task.type === "TAFSIR" ? `/tafsir?surah=${task.surahId}&ayah=${task.fromAyah}` : `/mushaf/surah/${task.surahId}?ayah=${task.fromAyah}`)}>{task.type === "TAFSIR" ? t("قراءة التفسير", "Read tafsir") : t("فتح في المصحف", "Open in mushaf")}</Link>}
              {editable && open && (
                <>
                  {task.status === "PENDING" && <ActionButton path={`/tasks/${task.id}`} method="PATCH" body={{ status: "IN_PROGRESS" }} label={t("بدء", "Start")} />}
                  <ActionButton path={`/tasks/${task.id}`} method="PATCH" body={{ status: "DONE" }} label={t("إكمال", "Complete")} variant="primary" />
                  {tomorrow && <ActionButton path={`/tasks/${task.id}/reschedule`} body={{ date: tomorrow }} label={t("تأجيل لغد", "Move to tomorrow")} />}
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
