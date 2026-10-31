"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Square } from "lucide-react";
import { callApi, useI18n } from "./client";

/** Records in the browser or accepts a file. Nothing uploads until the student confirms consent. */
export function RecitationRecorder({ surahs, defaults, taskId, needsGuardianConsent }: {
  surahs: { id: number; nameArabic: string; nameEnglish: string; ayahCount: number }[];
  defaults?: { surahId?: number; fromAyah?: number; toAyah?: number };
  taskId?: string;
  needsGuardianConsent: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [recording, setRecording] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);

  const start = async () => {
    setMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const m = new MediaRecorder(stream);
      m.ondataavailable = (e) => chunks.push(e.data);
      m.onstop = () => {
        stream.getTracks().forEach((x) => x.stop());
        const b = new Blob(chunks, { type: m.mimeType });
        setBlob(b);
        setPreview(URL.createObjectURL(b));
      };
      m.start();
      rec.current = m;
      setRecording(true);
    } catch {
      setMsg({ text: t("تعذر الوصول إلى الميكروفون. يمكنك رفع ملف بدلاً من ذلك.", "Could not access the microphone. You can upload a file instead.") });
    }
  };
  const stop = () => { rec.current?.stop(); setRecording(false); };

  if (needsGuardianConsent) {
    return <p role="note" className="rounded-lg bg-surface-2 p-3 text-sm">{t("لحماية خصوصيتك، يلزم أن يوافق ولي أمرك المرتبط بحسابك قبل إرسال التسجيلات.", "To protect your privacy, your linked guardian must consent before you can send recordings.")}</p>;
  }

  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const upload = fd.get("upload") as File | null;
        fd.delete("upload");
        const file = blob ? new File([blob], "recitation.webm", { type: blob.type }) : upload?.size ? upload : null;
        if (!file) { setMsg({ text: t("سجل تلاوتك أو اختر ملفاً أولاً.", "Record or choose a file first.") }); return; }
        fd.set("file", file);
        fd.set("consent", fd.get("consent") === "on" ? "true" : "false");
        if (taskId) fd.set("taskId", taskId);
        setBusy(true);
        try {
          await callApi("/recitations", "POST", fd);
          setMsg({ ok: true, text: t("تم الإرسال إلى معلمك.", "Sent to your teacher.") });
          setBlob(null); setPreview(null); form.reset();
          router.refresh();
        } catch (err) {
          const c = (err as { code?: string }).code;
          setMsg({ text: c === "storage_not_configured" ? t("تخزين الملفات غير مهيأ بعد.", "File storage is not configured yet.") : c === "unsupported_audio_type" ? t("صيغة الملف غير مدعومة.", "Unsupported file type.") : t("تعذر الإرسال، تأكد من البيانات والموافقة.", "Could not send. Check the details and consent.") });
        } finally { setBusy(false); }
      }}
    >
      <div>
        <label htmlFor="r-surah" className="label">{t("السورة", "Surah")}</label>
        <select id="r-surah" name="surahId" className="input" defaultValue={defaults?.surahId} required>
          {surahs.map((s) => <option key={s.id} value={s.id}>{s.id}. {locale === "ar" ? s.nameArabic : s.nameEnglish}</option>)}
        </select>
      </div>
      <div><label htmlFor="r-from" className="label">{t("من الآية", "From ayah")}</label><input id="r-from" name="fromAyah" type="number" min={1} className="input" defaultValue={defaults?.fromAyah ?? 1} required /></div>
      <div><label htmlFor="r-to" className="label">{t("إلى الآية", "To ayah")}</label><input id="r-to" name="toAyah" type="number" min={1} className="input" defaultValue={defaults?.toAyah ?? 1} required /></div>

      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        {recording
          ? <button type="button" className="btn btn-danger" onClick={stop}><Square className="size-4" aria-hidden="true" />{t("إنهاء التسجيل", "Stop recording")}</button>
          : <button type="button" className="btn btn-ghost" onClick={start}><Mic className="size-4" aria-hidden="true" />{t("بدء التسجيل", "Start recording")}</button>}
        <span aria-live="polite" className="text-sm text-danger">{recording ? t("جارٍ التسجيل…", "Recording…") : ""}</span>
        {preview && <audio controls src={preview} className="max-w-full" />}
      </div>

      <div className="sm:col-span-3">
        <label htmlFor="r-file" className="label">{t("أو ارفع ملفاً صوتياً (حتى 25 ميجابايت)", "Or upload an audio file (up to 25 MB)")}</label>
        <input id="r-file" name="upload" type="file" accept="audio/*" className="input" />
      </div>
      <div className="sm:col-span-3"><label htmlFor="r-note" className="label">{t("ملاحظة للمعلم", "Note for your teacher")}</label><input id="r-note" name="note" maxLength={500} className="input" /></div>
      <label className="flex items-start gap-2 text-sm sm:col-span-3">
        <input type="checkbox" name="consent" required className="mt-1 size-5" />
        <span>{t("أوافق على إرسال هذا التسجيل إلى معلمي، ويحفظ خاصاً ويحذف بعد انتهاء مدة الاحتفاظ.", "I agree to send this recording to my teacher. It stays private and is deleted after the retention period.")}</span>
      </label>
      <div className="flex items-center gap-3 sm:col-span-3">
        <button className="btn btn-primary" disabled={busy || recording}>{busy ? t("جارٍ الإرسال…", "Sending…") : t("إرسال إلى المعلم", "Send to teacher")}</button>
        <span aria-live="polite" className={`text-sm ${msg?.ok ? "text-ok" : "text-danger"}`}>{msg?.text}</span>
      </div>
    </form>
  );
}

/** Fetches a short-lived URL only when the listener asks, so links are not sitting in the page. */
export function RecitationPlayer({ id }: { id: string }) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  return url ? <audio controls autoPlay src={url} className="max-w-full" /> : (
    <span>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => callApi(`/recitations/${id}/audio`, "GET").then((d) => setUrl(d.url)).catch(() => setErr(true))}>{t("استماع", "Listen")}</button>
      {err && <span role="alert" className="ms-2 text-xs text-danger">{t("تعذر التحميل", "Could not load")}</span>}
    </span>
  );
}
