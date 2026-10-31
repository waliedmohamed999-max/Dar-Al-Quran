"use client";
import { createContext, useContext, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { localePath, translator, type Locale } from "@/lib/i18n";

const LocaleCtx = createContext<Locale>("ar");
export const LocaleProvider = ({ locale, children }: { locale: Locale; children: ReactNode }) => <LocaleCtx.Provider value={locale}>{children}</LocaleCtx.Provider>;
export function useI18n() {
  const locale = useContext(LocaleCtx);
  return { locale, t: translator(locale), lp: (p: string) => localePath(locale, p) };
}

const ERRORS: Record<string, [string, string]> = {
  unauthorized: ["يلزم تسجيل الدخول.", "Please sign in."],
  forbidden: ["ليست لديك صلاحية لهذا الإجراء.", "You do not have permission for this."],
  validation: ["يرجى مراجعة الحقول المدخلة.", "Please check the fields."],
  rate_limited: ["محاولات كثيرة، يرجى الانتظار قليلاً.", "Too many attempts, please wait."],
  conflict: ["هذا السجل موجود بالفعل.", "This record already exists."],
  not_found: ["العنصر غير موجود.", "Not found."],
  consent_required: ["يلزم تأكيد الموافقة.", "Consent is required."],
  guardian_consent_required: ["يلزم موافقة ولي الأمر قبل إرسال التسجيلات.", "Guardian consent is needed before sending recordings."],
  unsupported_audio_type: ["صيغة الملف غير مدعومة.", "This file type is not supported."],
  file_too_large: ["حجم الملف أكبر من المسموح (25 ميجابايت).", "File exceeds the 25 MB limit."],
  storage_not_configured: ["تخزين الملفات غير مهيأ بعد.", "File storage is not configured yet."],
  no_active_plan: ["لا توجد خطة فعالة لهذا الطالب.", "This student has no active plan."],
  requester_cannot_approve: ["لا يعتمد الطلب من تقدم به.", "The requester cannot approve their own request."],
  student_not_in_halaqa: ["الطالب ليس عضواً في الحلقة.", "The student is not in this halaqa."],
  already_submitted: ["تم تسليم هذا الاختبار من قبل.", "Already submitted."],
  must_be_in_review: ["يجب إرسال المحتوى للمراجعة أولاً.", "Send it for review first."],
  rejection_reason_required: ["اذكر سبب الرفض.", "Give the reason for rejecting."],
  mfa_required: ["فعل المصادقة الثنائية من صفحة أمان الحساب.", "Turn on two-factor authentication on the account security page."],
  reviewer_not_eligible: ["هذا المستخدم لا يملك صلاحية المراجعة العلمية.", "This user cannot do scholarly review."],
  hadith_grade_required: ["أضف درجة الحديث ومرجعها قبل الاعتماد.", "Add the hadith's grade and reference before approving."],
  dhikr_takhrij_required: ["أضف تخريج الذكر قبل الاعتماد.", "Add the dhikr's takhrij before approving."],
  collection_not_fully_reviewed: ["لم تعتمد كل أحاديث المسار بعد.", "Not every hadith in this track is approved yet."],
  scores_incomplete: ["لم يكمل كل المحكمين الدرجات.", "Not every judge has finished scoring."],
  judge_cannot_approve: ["يعتمد النتائج شخص من خارج لجنة التحكيم.", "Someone outside the judging panel must approve."],
  judge_not_eligible: ["أحد المحكمين لا يملك صلاحية التقييم.", "A judge is not eligible to assess."],
  no_registrations: ["لا يوجد مسجلون في هذه المسابقة.", "This competition has no registrations."],
  result_not_final: ["النتيجة لم تعتمد بعد.", "The result is not final yet."],
  result_below_pass: ["النتيجة دون نسبة النجاح.", "The result is below the pass mark."],
  appeal_pending: ["يوجد اعتراض لم يبت فيه.", "An appeal is still pending."],
  certificate_exists: ["طلبت شهادة لهذه النتيجة من قبل.", "A certificate was already requested for this result."],
  audio_license_required: ["اذكر مصدر الصوت وترخيصه.", "Name the audio source and licence."],
  verification_required: ["يلزم تأكيد التحقق الرسمي من صلة ولي الأمر.", "Confirm official verification of the guardian relationship."],
};

export async function callApi(path: string, method: string, body?: unknown) {
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error ?? "error"), { code: json.error, issues: json.issues });
  return json.data;
}

export type Field = {
  name: string;
  label: string;
  type?: "text" | "email" | "password" | "number" | "date" | "textarea" | "select" | "checkbox" | "url" | "time" | "multiselect" | "hidden" | "datetime-local";
  options?: { value: string; label: string }[];
  required?: boolean;
  defaultValue?: string | number | boolean | string[];
  hint?: string;
  min?: number;
  max?: number;
  full?: boolean;
};

const coerce = (f: Field, v: FormDataEntryValue | null) => {
  if (f.type === "checkbox") return v === "on";
  if (v === null || v === "") return undefined;
  if (f.type === "number") return Number(v);
  return v;
};

/** Generic server-validated form. `transform` reshapes values before sending. */
export function ActionForm({ path, method = "POST", fields, submit, success, transform, onDone, resetOnSuccess = true }: {
  path: string; method?: string; fields: Field[]; submit: string; success?: string;
  transform?: string; onDone?: "refresh" | "none"; resetOnSuccess?: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<{ busy?: boolean; error?: string; ok?: boolean; issues?: { path: string; message: string }[] }>({});

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const values: Record<string, unknown> = {};
    for (const f of fields) {
      values[f.name] = f.type === "multiselect" ? fd.getAll(f.name) : coerce(f, fd.get(f.name));
    }
    setState({ busy: true });
    try {
      await callApi(path, method, TRANSFORMS[transform ?? ""]?.(values) ?? values);
      setState({ ok: true });
      if (resetOnSuccess) form.reset();
      if (onDone !== "none") router.refresh();
    } catch (err) {
      const x = err as { code?: string; issues?: { path: string; message: string }[] };
      const m = ERRORS[x.code ?? ""];
      setState({ error: m ? (locale === "ar" ? m[0] : m[1]) : t("تعذر تنفيذ الطلب، حاول مرة أخرى.", "Something went wrong, please try again."), issues: x.issues });
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2" noValidate={false}>
      {fields.filter((f) => f.type === "hidden").map((f) => <input key={f.name} type="hidden" name={f.name} value={String(f.defaultValue ?? "")} />)}
      {fields.filter((f) => f.type !== "hidden").map((f) => {
        const id = `f-${path}-${f.name}`;
        const issue = state.issues?.find((i) => i.path === f.name);
        const common = { id, name: f.name, required: f.required, "aria-invalid": issue ? true : undefined, "aria-describedby": issue || f.hint ? `${id}-d` : undefined };
        return (
          <div key={f.name} className={f.full || f.type === "textarea" ? "sm:col-span-2" : ""}>
            {f.type === "checkbox" ? (
              <label htmlFor={id} className="flex min-h-11 items-center gap-2">
                <input type="checkbox" className="size-5" defaultChecked={Boolean(f.defaultValue)} {...common} />
                <span>{f.label}</span>
              </label>
            ) : (
              <>
                <label htmlFor={id} className="label">{f.label}{f.required && <span aria-hidden="true" className="text-danger"> *</span>}</label>
                {f.type === "textarea" ? (
                  <textarea className="input" rows={f.max ?? 4} defaultValue={f.defaultValue as string} {...common} />
                ) : f.type === "select" || f.type === "multiselect" ? (
                  <select className="input" multiple={f.type === "multiselect"} defaultValue={f.defaultValue as string} {...common}>
                    {f.type === "select" && !f.required && <option value="">{t("— بدون —", "— None —")}</option>}
                    {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input className="input" type={f.type ?? "text"} min={f.min} max={f.max} defaultValue={f.defaultValue as string} {...common} />
                )}
              </>
            )}
            {(issue || f.hint) && <p id={`${id}-d`} className={`mt-1 text-xs ${issue ? "text-danger" : "text-ink-2"}`}>{issue?.message ?? f.hint}</p>}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button className="btn btn-primary" disabled={state.busy}>{state.busy ? t("جارٍ التنفيذ…", "Working…") : submit}</button>
        <span aria-live="polite" className="text-sm">
          {state.error && <span className="text-danger">{state.error}</span>}
          {state.ok && <span className="text-ok">{success ?? t("تم الحفظ.", "Saved.")}</span>}
        </span>
      </div>
    </form>
  );
}

/** Functions cannot cross the server/client boundary, so reshapers are registered by name. */
const TRANSFORMS: Record<string, (v: Record<string, unknown>) => unknown> = {
  halaqa: (v) => {
    const { weekday, start, end, ...rest } = v as { weekday?: string; start?: string; end?: string };
    const mins = (s?: string) => { const [h, m] = (s ?? "0:0").split(":").map(Number); return h * 60 + m; };
    return { ...rest, teacherId: (rest as { teacherId?: string }).teacherId ?? null, schedule: weekday !== undefined && start && end ? [{ weekday: Number(weekday), startMin: mins(start), endMin: mins(end) }] : [] };
  },
  placementReview: (v) => {
    const { track, note, ...skills } = v;
    return { track, note, skills };
  },
  competition: (v) => ({ ...v, randomize: Boolean(v.randomize), leaderboardEnabled: Boolean(v.leaderboardEnabled), published: Boolean(v.published) }),
  appeal: (v) => ({ approve: Boolean(v.accept), decision: v.decision, ...(v.newScore === "" || v.newScore == null ? {} : { newScore: v.newScore }) }),
  scholarly: (v) => ({ approve: v.decision === "approve", reason: v.reason || undefined }),
  scores: (v) => ({ scores: Object.entries(v).map(([criterionId, score]) => ({ criterionId, score })) }),
  rubric: (v) => ({
    title: v.title, description: v.description || undefined,
    criteria: String(v.criteria ?? "").split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((p) => p[0]).map(([labelAr, guidanceAr, maxScore, weight]) => ({ labelAr, guidanceAr, maxScore: maxScore || 10, weight: weight || 1 })),
  }),
  hadithEdit: (v) => ({ ...v, vocabulary: String(v.vocabulary ?? "").split("\n").map((l) => l.split(":")).filter((p) => p.length >= 2).map(([word, ...m]) => ({ word: word.trim(), meaning: m.join(":").trim() })) }),
  lessonNote: (v) => ({ note: v.note }),
  grantRole: (v) => ({ role: v.role, grant: true }),
  substitute: (v) => ({ teacherId: v.teacherId ?? null }),
  approveLink: (v) => ({ approve: true, verified: v.verified }),
  program: (v) => {
    const arr = (k: string) => String(v[k] ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
    return { ...v, objectivesAr: arr("objectivesAr"), audienceAr: arr("audienceAr"), levelsAr: arr("levelsAr"), curriculumAr: arr("curriculumAr"), outcomesAr: arr("outcomesAr"), requirementsAr: arr("requirementsAr"), instructorNoteAr: v.instructorNoteAr ?? null };
  },
  homeSettings: (v) => ({ home: v }),
  seoSettings: (v) => ({ seo: v }),
  socialSettings: (v) => ({ social: v }),
  plan: (v) => ({ ...v, studyDays: [0, 1, 2, 3, 4, 5, 6] }),
  grade: (v) => ({ grades: [{ questionId: v.questionId, ratio: Number(v.ratio), teacherNote: v.teacherNote }] }),
  review: (v) => {
    const { mistakeCategory, mistakeNote, mistakeAyah, ...rest } = v;
    return { ...rest, mistakes: mistakeNote ? [{ category: mistakeCategory, note: mistakeNote, ayah: mistakeAyah }] : [] };
  },
  question: (v) => {
    const { optionA, optionB, optionC, ...rest } = v;
    const options = [["a", optionA], ["b", optionB], ["c", optionC]].filter(([, t]) => t).map(([key, textAr]) => ({ key, textAr }));
    return rest.type === "MULTIPLE_CHOICE" ? { ...rest, options } : rest;
  },
  assessment: (v) => ({ ...v, published: Boolean(v.published) }),
  settingsBrand: (v) => ({ brand: { nameAr: v.nameAr, nameEn: v.nameEn, logoUrl: v.logoUrl ?? "" }, contact: { email: v.email ?? "", phone: v.phone ?? "", address: v.address ?? "" } }),
  preferences: (v) => ({ emailEnabled: v.emailEnabled, maxEmailsPerDay: v.maxEmailsPerDay, mutedTypes: v.mutedTypes ?? [] }),
};

export function ActionButton({ path, method = "POST", body, label, confirm, variant = "ghost", success }: {
  path: string; method?: string; body?: unknown; label: string; confirm?: string; variant?: "primary" | "ghost" | "danger"; success?: string;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<{ busy?: boolean; msg?: string; ok?: boolean }>({});
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className={`btn btn-sm btn-${variant}`}
        disabled={state.busy}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setState({ busy: true });
          try {
            await callApi(path, method, body);
            setState({ ok: true, msg: success });
            router.refresh();
          } catch (e) {
            const m = ERRORS[(e as { code?: string }).code ?? ""];
            setState({ msg: m ? (locale === "ar" ? m[0] : m[1]) : t("تعذر التنفيذ", "Failed") });
          }
        }}
      >
        {label}
      </button>
      <span aria-live="polite" className={`text-xs ${state.ok ? "text-ok" : "text-danger"}`}>{state.msg}</span>
    </span>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useI18n();
  return (
    <button type="button" className="btn btn-ghost btn-sm" aria-label={t("تبديل الوضع الليلي", "Toggle dark mode")} onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
      <Sun className="hidden size-4 dark:block" aria-hidden="true" />
      <Moon className="size-4 dark:hidden" aria-hidden="true" />
    </button>
  );
}
