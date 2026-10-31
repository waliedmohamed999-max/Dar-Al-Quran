"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Heart, Mic, Share2, Square } from "lucide-react";
import { callApi, useI18n } from "./client";
import { hiddenWordIndexes, segments, writtenRecallPercent } from "@/modules/hadith/exercises";
import { VoiceGuide } from "./placement-aids";

// ---------- Audio capture shared by hadith, placement and exams ----------
export function AudioUpload({ path, extra, onDone, label }: { path: string; extra?: Record<string, string>; onDone?: () => void; label?: string }) {
  const { t } = useI18n();
  const [recording, setRecording] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [consent, setConsent] = useState(false);
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const start = async () => {
    setMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const m = new MediaRecorder(stream);
      m.ondataavailable = (e) => chunks.push(e.data);
      m.onstop = () => { stream.getTracks().forEach((x) => x.stop()); setBlob(new Blob(chunks, { type: m.mimeType })); };
      m.start(); rec.current = m; setRecording(true);
    } catch { setMsg({ text: t("تعذر الوصول إلى الميكروفون.", "Could not access the microphone.") }); }
  };
  const send = async () => {
    if (!blob) return;
    const fd = new FormData();
    fd.set("file", new File([blob], "audio.webm", { type: blob.type }));
    fd.set("consent", String(consent));
    for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v);
    try { await callApi(path, "POST", fd); setMsg({ ok: true, text: t("تم الإرسال.", "Sent.") }); setBlob(null); onDone?.(); }
    catch (e) { const c = (e as { code?: string }).code; setMsg({ text: c === "guardian_consent_required" ? t("يلزم موافقة ولي الأمر.", "Guardian consent is needed.") : c === "storage_not_configured" ? t("التخزين غير مهيأ.", "Storage is not configured.") : t("تعذر الإرسال. تأكد من الموافقة.", "Could not send. Check consent.") }); }
  };
  return (
    <div className="space-y-2 rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        {recording ? <button type="button" className="btn btn-danger btn-sm" onClick={() => { rec.current?.stop(); setRecording(false); }}><Square className="size-4" aria-hidden="true" />{t("إنهاء", "Stop")}</button>
          : <button type="button" className="btn btn-ghost btn-sm" onClick={start}><Mic className="size-4" aria-hidden="true" />{label ?? t("بدء التسجيل", "Start recording")}</button>}
        {blob && <audio controls src={URL.createObjectURL(blob)} className="max-w-full" />}
      </div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 size-5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />{t("أوافق على إرسال التسجيل إلى المعلم، ويبقى خاصاً ويحذف بعد مدة الاحتفاظ.", "I agree to send this to the teacher. It stays private and is deleted after the retention period.")}</label>
      <button type="button" className="btn btn-primary btn-sm" disabled={!blob || !consent} onClick={send}>{t("إرسال", "Send")}</button>
      <span aria-live="polite" className={`ms-2 text-sm ${msg?.ok ? "text-ok" : "text-danger"}`}>{msg?.text}</span>
    </div>
  );
}

export function AudioLink({ path }: { path: string }) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  return url ? <audio controls src={url} className="max-w-full" /> : <span><button type="button" className="btn btn-ghost btn-sm" onClick={() => callApi(path, "GET").then((d) => setUrl(d.url)).catch(() => setErr(true))}>{t("استماع", "Listen")}</button>{err && <span role="alert" className="ms-2 text-xs text-danger">{t("لا يوجد تسجيل", "No recording")}</span>}</span>;
}

// ---------- Adhkar ----------
export function DhikrCard({ d, signedIn }: { d: { id: string; titleAr: string; text: string; repeat: number | null; sourceName: string; takhrij: string | null; explanation: string | null; explanationSource: string | null; audioUrl: string | null; audioSource?: string | null; audioLicense?: string | null }; signedIn: boolean }) {
  const { t } = useI18n();
  const [count, setCount] = useState(0);
  const [fav, setFav] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const share = async () => {
    const text = `${d.text}\n— ${d.sourceName}`;
    if (navigator.share) await navigator.share({ text }).catch(() => undefined);
    else { await navigator.clipboard.writeText(text); setMsg(t("نسخ.", "Copied.")); }
  };
  return (
    <article className="card">
      <p className="text-xs font-semibold text-gold">{d.titleAr}</p>
      <p className="mt-2 whitespace-pre-wrap font-display text-xl leading-loose" lang="ar" dir="rtl">{d.text}</p>
      <p className="mt-2 text-xs text-ink-2">{t("المصدر", "Source")}: {d.sourceName}{d.takhrij ? ` · ${d.takhrij}` : ""}</p>
      {d.explanation && <p className="mt-2 rounded bg-surface-2 p-2 text-sm">{d.explanation} <span className="text-xs text-ink-2">({d.explanationSource})</span></p>}
      {d.audioUrl && <div className="mt-2"><audio controls preload="none" src={d.audioUrl} className="w-full" /><p className="mt-1 text-xs text-ink-2">{d.audioSource}{d.audioLicense ? ` · ${d.audioLicense}` : ""}</p></div>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setCount(count + 1)} aria-label={t("زيادة العداد", "Increase counter")}>{count}{d.repeat ? ` / ${d.repeat}` : ""}</button>
        <button type="button" className="btn btn-ghost btn-sm" aria-label={t("نسخ", "Copy")} onClick={() => navigator.clipboard.writeText(d.text).then(() => setMsg(t("نسخ.", "Copied.")))}><Copy className="size-4" aria-hidden="true" /></button>
        <button type="button" className="btn btn-ghost btn-sm" aria-label={t("مشاركة", "Share")} onClick={share}><Share2 className="size-4" aria-hidden="true" /></button>
        {signedIn && <button type="button" className="btn btn-ghost btn-sm" aria-pressed={fav} aria-label={t("المفضلة", "Favourite")} onClick={() => callApi(`/adhkar/${d.id}/favorite`, "POST").then((r) => setFav(r.active))}><Heart className={`size-4 ${fav ? "fill-current" : ""}`} aria-hidden="true" /></button>}
        <span aria-live="polite" className="text-xs text-ok">{msg}</span>
      </div>
    </article>
  );
}

const hm = (m: number | null | undefined) => (m == null ? "" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
const mins = (v: FormDataEntryValue | null) => { const [h, m] = String(v ?? "").split(":").map(Number); return Number.isFinite(h) && String(v) ? h * 60 + (m || 0) : null; };

type Pref = { enabled: boolean; timezone: string; categories: string[]; morningMin: number | null; eveningMin: number | null; sleepMin: number | null; wakeMin: number | null; days: number[]; dndStartMin: number | null; dndEndMin: number | null; minIntervalMin: number; pushEnabled: boolean; usePrayerTimes: boolean; latitude: number | null; longitude: number | null; calcMethod: string };

export function AdhkarSettings({ pref, vapid, methods, days }: { pref: Pref | null; vapid: string | null; methods: readonly string[]; days: string[] }) {
  const { t } = useI18n();
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const detected = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "Asia/Riyadh";
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const push = f.get("pushEnabled") === "on";
    try {
      if (!push && "serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = await reg?.pushManager.getSubscription();
        if (sub) { await sub.unsubscribe(); await callApi("/me/push", "DELETE", { endpoint: sub.endpoint }); }
      }
      if (push) {
        if (!vapid || !("serviceWorker" in navigator) || !("PushManager" in window)) throw Object.assign(new Error(), { code: "push_unavailable" });
        if ((await Notification.requestPermission()) !== "granted") throw Object.assign(new Error(), { code: "push_denied" });
        await navigator.serviceWorker.register("/sw.js");
        // Subscribing needs an active worker, which a first registration does not have yet.
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapid });
        await callApi("/me/push", "POST", sub.toJSON());
      }
      await callApi("/me/adhkar-preferences", "PUT", {
        enabled: f.get("enabled") === "on", timezone: f.get("timezone"), categories: f.getAll("categories"), days: f.getAll("days").map(Number),
        morningMin: mins(f.get("morning")), eveningMin: mins(f.get("evening")), sleepMin: mins(f.get("sleep")), wakeMin: mins(f.get("wake")), dndStartMin: mins(f.get("dndStart")), dndEndMin: mins(f.get("dndEnd")),
        minIntervalMin: Number(f.get("minIntervalMin")), pushEnabled: push, usePrayerTimes: f.get("usePrayerTimes") === "on",
        latitude: f.get("latitude") ? Number(f.get("latitude")) : null, longitude: f.get("longitude") ? Number(f.get("longitude")) : null, calcMethod: f.get("calcMethod"),
      });
      setMsg({ ok: true, text: t("حفظت الإعدادات.", "Settings saved.") });
    } catch (x) {
      const c = (x as { code?: string }).code;
      setMsg({ text: c === "push_unavailable" ? t("إشعارات المتصفح غير متاحة هنا.", "Browser notifications are unavailable here.") : c === "push_denied" ? t("لم يمنح المتصفح الإذن.", "The browser did not grant permission.") : c === "location_required" ? t("مواقيت الصلاة تحتاج إلى الموقع.", "Prayer times need a location.") : t("تحقق من البيانات.", "Check the details.") });
    }
  };
  const on = pref?.categories ?? ["MORNING_EVENING"];
  const check = (name: string, value: string, label: string, checked: boolean) => <label key={value} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name={name} value={value} defaultChecked={checked} className="size-5" />{label}</label>;
  const time = (name: string, label: string, v?: number | null) => <div><label htmlFor={`ad-${name}`} className="label">{label}</label><input id={`ad-${name}`} name={name} type="time" className="input" defaultValue={hm(v)} /></div>;
  return (
    <form onSubmit={save} className="space-y-4">
      <label className="flex min-h-11 items-center gap-2 font-semibold"><input type="checkbox" name="enabled" defaultChecked={pref?.enabled ?? false} className="size-5" />{t("تفعيل تذكيرات الأذكار", "Enable adhkar reminders")}</label>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="ad-tz" className="label">{t("المنطقة الزمنية", "Time zone")}</label><input id="ad-tz" name="timezone" dir="ltr" className="input" required defaultValue={pref?.timezone ?? detected} /></div>
        <div><label htmlFor="ad-int" className="label">{t("أقل فاصل بين التذكيرات بالدقائق", "Minimum minutes between reminders")}</label><input id="ad-int" name="minIntervalMin" type="number" min={15} max={1440} className="input" defaultValue={pref?.minIntervalMin ?? 60} /></div>
        {time("morning", t("وقت أذكار الصباح", "Morning time"), pref ? pref.morningMin : 420)}
        {time("evening", t("وقت أذكار المساء", "Evening time"), pref ? pref.eveningMin : 1020)}
        {time("sleep", t("وقت النوم", "Sleep time"), pref?.sleepMin)}
        {time("wake", t("وقت الاستيقاظ", "Waking time"), pref?.wakeMin)}
        {time("dndStart", t("بداية عدم الإزعاج", "Do not disturb from"), pref?.dndStartMin)}
        {time("dndEnd", t("نهاية عدم الإزعاج", "Do not disturb until"), pref?.dndEndMin)}
      </div>
      <fieldset><legend className="label">{t("الأنواع المفعلة", "Enabled types")}</legend><div className="grid gap-x-3 sm:grid-cols-2">
        {check("categories", "MORNING_EVENING", t("الصباح والمساء", "Morning and evening"), on.includes("MORNING_EVENING"))}
        {check("categories", "SLEEP", t("النوم", "Sleep"), on.includes("SLEEP"))}
        {check("categories", "WAKING", t("الاستيقاظ", "Waking"), on.includes("WAKING"))}
        {check("categories", "AFTER_PRAYER", t("بعد الصلاة (يتطلب المواقيت)", "After prayer (needs prayer times)"), on.includes("AFTER_PRAYER"))}
      </div></fieldset>
      <fieldset><legend className="label">{t("الأيام", "Days")}</legend><div className="flex flex-wrap gap-x-3">{days.map((d, i) => check("days", String(i), d, (pref?.days ?? [0, 1, 2, 3, 4, 5, 6]).includes(i)))}</div></fieldset>
      <fieldset className="rounded-lg border border-line p-3"><legend className="label px-1">{t("مواقيت الصلاة (اختياري)", "Prayer times (optional)")}</legend>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="usePrayerTimes" defaultChecked={pref?.usePrayerTimes} className="size-5" />{t("ربط التذكير بمواقيت محسوبة (تقديرية، والمرجع جهة بلدك)", "Link to calculated times (estimates; your local authority is the reference)")}</label>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label htmlFor="ad-lat" className="label">{t("خط العرض", "Latitude")}</label><input id="ad-lat" name="latitude" type="number" step="0.01" dir="ltr" className="input" defaultValue={pref?.latitude ?? ""} /></div>
          <div><label htmlFor="ad-lng" className="label">{t("خط الطول", "Longitude")}</label><input id="ad-lng" name="longitude" type="number" step="0.01" dir="ltr" className="input" defaultValue={pref?.longitude ?? ""} /></div>
          <div><label htmlFor="ad-m" className="label">{t("طريقة الحساب", "Method")}</label><select id="ad-m" name="calcMethod" dir="ltr" className="input" defaultValue={pref?.calcMethod ?? "UmmAlQura"}>{methods.map((m) => <option key={m}>{m}</option>)}</select></div>
        </div>
      </fieldset>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="pushEnabled" defaultChecked={pref?.pushEnabled} disabled={!vapid} className="mt-1 size-5" /><span>{t("إشعارات المتصفح الصامتة عند إغلاق الموقع، بإذن صريح منك. إزالة العلامة ثم الحفظ تلغي الاشتراك.", "Silent browser notifications when the site is closed, with your explicit permission. Untick and save to unsubscribe.")}{!vapid && <span className="block text-xs text-ink-2">{t("لم تهيئ الإدارة هذه الخدمة بعد.", "The administration has not configured this yet.")}</span>}</span></label>
      <button className="btn btn-primary">{t("حفظ", "Save")}</button>
      {pref?.pushEnabled && vapid && <button type="button" className="btn btn-ghost ms-2" onClick={() => callApi("/me/push/test", "POST").then((r) => setMsg({ ok: r.delivered > 0, text: r.delivered > 0 ? t("أرسل إشعار تجريبي.", "A test notification was sent.") : t("لم يصل الإشعار.", "The notification was not delivered.") })).catch(() => setMsg({ text: t("لا يوجد اشتراك في هذا المتصفح.", "No subscription in this browser.") }))}>{t("إرسال إشعار تجريبي", "Send a test notification")}</button>}
      <span aria-live="polite" className={`ms-2 text-sm ${msg?.ok ? "text-ok" : "text-danger"}`}>{msg?.text}</span>
    </form>
  );
}

/** A dismissible card while the site is open. It never blocks the page and never plays sound. */
export function AdhkarToast() {
  const { t, lp } = useI18n();
  const [n, setN] = useState<{ id: string; title: string; body: string; href: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    const poll = () => callApi("/me/adhkar-reminder", "GET").then((d) => live && setN(d)).catch(() => undefined);
    poll();
    const id = setInterval(poll, 120000);
    return () => { live = false; clearInterval(id); };
  }, []);
  if (!n) return null;
  const close = () => { callApi(`/me/notifications/${n.id}/read`, "POST").catch(() => undefined); setN(null); };
  return (
    <aside role="status" className="no-print card fixed bottom-4 start-4 z-50 max-w-xs shadow-lg">
      <p className="font-semibold text-brand">{n.title}</p><p className="text-sm text-ink-2">{n.body}</p>
      <div className="mt-2 flex gap-2"><Link className="btn btn-primary btn-sm" href={lp(n.href ?? "/adhkar")} onClick={close}>{t("فتح", "Open")}</Link><button type="button" className="btn btn-ghost btn-sm" onClick={close}>{t("لاحقاً", "Later")}</button></div>
    </aside>
  );
}

// ---------- Hadith trainer ----------
export function HadithTrainer({ id, text, signedIn, isStudent }: { id: string; text: string; signedIn: boolean; isStudent: boolean }) {
  const { t, lp } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useState<"read" | "hide" | "order" | "write" | "recite">("read");
  const [hide, setHide] = useState(30);
  const [written, setWritten] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const parts = useMemo(() => segments(text), [text]);
  const shown = useMemo(() => parts.map((s, i) => ({ s, i })).sort((a, b) => a.s.length - b.s.length || b.i - a.i), [parts]);
  const words = text.split(" ");
  const hidden = hiddenWordIndexes(words.length, hide, 11);
  const done = picked.length === parts.length;
  const correct = done && picked.every((v, i) => v === i);
  const tabs: [typeof tab, string, string][] = [["read", "النص كاملاً", "Full text"], ["hide", "إخفاء تدريجي", "Gradual hiding"], ["order", "ترتيب المقاطع", "Order segments"], ["write", "كتابة", "Write"], ["recite", "تسميع", "Recite"]];
  return (
    <div>
      <div role="tablist" aria-label={t("وضع الحفظ", "Memorization mode")} className="mb-3 flex flex-wrap gap-1.5">{tabs.map(([k, ar, en]) => <button key={k} role="tab" type="button" aria-selected={tab === k} className={`btn btn-sm ${tab === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(k)}>{t(ar, en)}</button>)}</div>
      {tab === "read" && <p className="whitespace-pre-wrap font-display text-xl leading-loose" lang="ar" dir="rtl">{text}</p>}
      {tab === "hide" && <div><label htmlFor="hh" className="label">{t(`نسبة الإخفاء: ${hide}%`, `Hidden: ${hide}%`)}</label><input id="hh" type="range" min={0} max={100} step={10} value={hide} onChange={(e) => setHide(Number(e.target.value))} className="mb-3 w-full" /><p className="font-display text-xl leading-loose" lang="ar" dir="rtl">{words.map((w, i) => <span key={i}><span className={hidden.has(i) ? "word-hidden" : ""}>{w}</span> </span>)}</p></div>}
      {tab === "order" && <div><p className="mb-2 text-sm text-ink-2">{t("اضغط المقاطع بترتيبها.", "Tap the segments in order.")}</p><ul className="space-y-1">{shown.map(({ s, i }) => <li key={i}><button type="button" disabled={picked.includes(i)} lang="ar" className="btn btn-ghost h-auto w-full justify-start py-2 text-start font-normal" onClick={() => setPicked([...picked, i])}>{picked.includes(i) ? `${picked.indexOf(i) + 1}. ` : ""}{s}</button></li>)}</ul>{done && <p aria-live="polite" className={`mt-2 ${correct ? "text-ok" : "text-warn"}`}>{correct ? t("ترتيب صحيح.", "Correct order.") : t("راجع الترتيب.", "Check the order.")} <button type="button" className="underline" onClick={() => setPicked([])}>{t("إعادة", "Reset")}</button></p>}</div>}
      {tab === "write" && <div><label htmlFor="hw" className="label">{t("اكتب ما حفظته", "Write what you memorized")}</label><textarea id="hw" rows={5} lang="ar" dir="rtl" className="input" value={written} onChange={(e) => setWritten(e.target.value)} /><button type="button" className="btn btn-ghost btn-sm mt-2" onClick={() => setScore(writtenRecallPercent(text, written))}>{t("تحقق", "Check")}</button>{score !== null && <p aria-live="polite" className="mt-2 text-sm">{t(`تطابق الكلمات: ${score}%. مؤشر للتدريب فقط، ولا يثبت الحفظ إلا بالتسميع على المعلم.`, `Word match: ${score}%. A practice indicator only; memorization is confirmed by reciting to a teacher.`)}</p>}</div>}
      {tab === "recite" && (!signedIn ? <p><Link className="underline" href={lp("/login")}>{t("سجل الدخول لإرسال التسميع.", "Sign in to send your recitation.")}</Link></p> : !isStudent ? <p className="text-sm text-ink-2">{t("التسميع للطلاب.", "Recitation is for students.")}</p> : <AudioUpload path={`/hadith/${id}/submit`} onDone={() => router.refresh()} />)}
    </div>
  );
}

// ---------- Placement ----------
type PQ = { id: string; type: string; level: number; promptAr: string; promptEn: string | null; options: { key: string; textAr: string; textEn?: string }[] | null };
export function PlacementWizard({ initial, questions, passages, surahs, days }: {
  initial: { stage: number; status: string; intake: Record<string, unknown>; tajweedAnswers: Record<string, string>; readingFileId: string | null; memorizationFileId: string | null };
  questions: PQ[]; passages: { id: number; surahId: number; ayahNumber: number; text: string }[]; surahs: { id: number; name: string }[]; days: string[];
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [stage, setStage] = useState(Math.min(initial.stage, 5));
  const [err, setErr] = useState<string | null>(null);
  const [check, setCheck] = useState<{ surahId: number; nextAyah: { promptId: number; prompt: string; options: { id: number; text: string }[] } | null; order: { id: number; text: string }[] } | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const steps = [t("الملف الأولي", "Profile"), t("القراءة", "Reading"), t("التجويد", "Tajweed"), t("الحفظ", "Memorization"), t("المراجعة والإرسال", "Review and send")];
  const i = initial.intake as Record<string, string | number | string[] | undefined>;
  const go = async (fn: () => Promise<unknown>, to: number) => {
    setErr(null);
    try { await fn(); setStage(to); router.refresh(); window.scrollTo({ top: 0 }); }
    catch (e) { const c = (e as { code?: string }).code; setErr(c === "intake_incomplete" ? t("أكمل الملف الأولي أولاً.", "Complete the profile first.") : t("تعذر الحفظ. تحقق من البيانات.", "Could not save. Check the details.")); }
  };
  const select = (name: string, label: string, opts: [string, string, string][], def?: unknown) => <div><label htmlFor={`pl-${name}`} className="label">{label}</label><select id={`pl-${name}`} name={name} className="input" defaultValue={def as string}>{opts.map(([v, ar, en]) => <option key={v} value={v}>{t(ar, en)}</option>)}</select></div>;
  return (
    <div>
      <ol className="mb-6 grid grid-cols-5 gap-1 text-center text-xs" aria-label={t("مراحل التقييم", "Assessment stages")}>
        {steps.map((s, k) => <li key={s} aria-current={stage === k + 1 ? "step" : undefined}><button type="button" className="w-full" onClick={() => setStage(k + 1)}><span className={`mb-1 block h-1.5 rounded-full ${k + 1 <= stage ? "bg-brand" : "bg-surface-2"}`} /><span className={k + 1 === stage ? "font-bold text-brand" : "text-ink-2"}>{s}</span></button></li>)}
      </ol>
      {err && <p role="alert" className="mb-3 text-sm text-danger">{err}</p>}
      <VoiceGuide key={stage} text={[t("املأ بياناتك الأساسية وهدفك والأوقات المناسبة لك، ثم اضغط حفظ ومتابعة.", "Fill in your details, goal and suitable times, then press save and continue."), t("اقرأ الآيات المعروضة بصوتك وسجلها أو ارفع ملفاً. سيقيم معلمك قراءتك.", "Read the ayahs aloud and record them or upload a file. Your teacher assesses your reading."), t("أجب عن الأسئلة النظرية ثم اضغط حفظ ومتابعة. التطبيق يقيمه المعلم.", "Answer the theory questions, then press save and continue. A teacher assesses application."), t("اختر سورة تحفظها وأجب عن سؤالي الآية التالية والترتيب، ثم سمع من حفظك.", "Choose a surah you know, answer the next-ayah and order questions, then recite from memory."), t("راجع ما أكملته ثم أرسله إلى معلمك.", "Review what you completed, then send it to your teacher.")][stage - 1]} />
      {stage === 1 && (
        <form className="card grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); go(() => callApi("/placement/intake", "PUT", { ageGroup: f.get("ageGroup"), schoolLevel: f.get("schoolLevel") || undefined, experience: f.get("experience"), goal: f.get("goal"), memorizedJuz: f.get("memorizedJuz"), memorizedFromSurah: f.get("memorizedFromSurah") || undefined, days: f.getAll("days").map(Number), timeOfDay: f.get("timeOfDay"), format: f.get("format") }), 2); }}>
          {select("ageGroup", t("الفئة العمرية", "Age group"), [["child", "طفل", "Child"], ["teen", "فتى أو فتاة", "Teen"], ["adult", "بالغ", "Adult"]], i.ageGroup)}
          <div><label htmlFor="pl-school" className="label">{t("المستوى الدراسي (اختياري)", "School level (optional)")}</label><input id="pl-school" name="schoolLevel" className="input" defaultValue={i.schoolLevel as string} /></div>
          {select("experience", t("الخبرة السابقة", "Experience"), [["none", "لا توجد", "None"], ["some", "بعض الخبرة", "Some"], ["regular", "دراسة منتظمة", "Regular study"]], i.experience)}
          {select("goal", t("الهدف", "Goal"), [["read", "تعلم القراءة", "Learn to read"], ["memorize", "الحفظ", "Memorize"], ["revise", "تثبيت المحفوظ", "Consolidate"], ["tajweed", "إتقان التجويد", "Master tajweed"]], i.goal)}
          <div><label htmlFor="pl-juz" className="label">{t("عدد الأجزاء المحفوظة تقريباً", "Juz memorized, approximately")}</label><input id="pl-juz" name="memorizedJuz" type="number" min={0} max={30} required className="input" defaultValue={(i.memorizedJuz as number) ?? 0} /></div>
          <div><label htmlFor="pl-sur" className="label">{t("آخر سورة تحفظها جيداً", "Latest surah you know well")}</label><select id="pl-sur" name="memorizedFromSurah" className="input" defaultValue={(i.memorizedFromSurah as number) ?? 114}>{surahs.map((s) => <option key={s.id} value={s.id}>{s.id}. {s.name}</option>)}</select></div>
          {select("timeOfDay", t("الوقت المناسب", "Preferred time"), [["morning", "صباحاً", "Morning"], ["afternoon", "بعد الظهر", "Afternoon"], ["evening", "مساءً", "Evening"]], i.timeOfDay)}
          {select("format", t("نوع الحلقة", "Format"), [["group", "جماعية", "Group"], ["individual", "فردية", "Individual"], ["either", "أيهما", "Either"]], i.format)}
          <fieldset className="sm:col-span-2"><legend className="label">{t("الأيام المناسبة", "Suitable days")}</legend><div className="flex flex-wrap gap-x-3">{days.map((d, k) => <label key={d} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="days" value={k} defaultChecked={((i.days as string[]) ?? []).map(Number).includes(k)} className="size-5" />{d}</label>)}</div></fieldset>
          <div className="sm:col-span-2"><button className="btn btn-primary">{t("حفظ ومتابعة", "Save and continue")}</button></div>
        </form>
      )}
      {stage === 2 && (
        <div className="card space-y-3">
          <p>{t("اقرأ هذه الآيات بصوتك وأرسلها. يقيم معلمك النطق والمخارج والطلاقة والوقف بنفسه.", "Read these ayahs aloud and send them. Your teacher personally assesses pronunciation, articulation, fluency and stopping.")}</p>
          <div className="quran" lang="ar" dir="rtl" style={{ "--quran-size": "1.5rem" } as React.CSSProperties}>{passages.map((a) => <span key={a.id}>{a.text}<span className="ayah-end" aria-hidden="true">{a.ayahNumber}</span> </span>)}</div>
          <AudioUpload path="/placement/audio" extra={{ stage: "reading" }} onDone={() => router.refresh()} />
          {initial.readingFileId && <p className="text-sm text-ok">{t("أرسلت تسجيل القراءة.", "Reading recording sent.")}</p>}
          <button type="button" className="btn btn-primary" onClick={() => setStage(3)}>{t("متابعة", "Continue")}</button>
        </div>
      )}
      {stage === 3 && (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); go(() => callApi("/placement/tajweed", "PUT", { answers: Object.fromEntries(questions.map((q) => [q.id, String(f.get(q.id) ?? "")])) }), 4); }}>
          {questions.length === 0 && <p className="card text-ink-2">{t("لم تضف الإدارة أسئلة لهذه المرحلة بعد، ويمكنك المتابعة.", "The administration has not added questions for this stage yet. You can continue.")}</p>}
          {questions.map((q, n) => <fieldset key={q.id} className="card"><legend className="px-1 font-semibold">{n + 1}. {locale === "en" && q.promptEn ? q.promptEn : q.promptAr}</legend>{q.options?.map((o) => <label key={o.key} className="flex min-h-11 items-center gap-2"><input type="radio" name={q.id} value={o.key} defaultChecked={initial.tajweedAnswers[q.id] === o.key} className="size-5" />{locale === "en" && o.textEn ? o.textEn : o.textAr}</label>)}</fieldset>)}
          <p className="text-xs text-ink-2">{t("هذه الأسئلة تقيس المعرفة النظرية فقط، أما التطبيق فيقيمه المعلم.", "These questions measure theory only. A teacher assesses application.")}</p>
          <button className="btn btn-primary">{t("حفظ ومتابعة", "Save and continue")}</button>
        </form>
      )}
      {stage === 4 && (
        <div className="card space-y-4">
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); const s = new FormData(e.currentTarget).get("surah"); setPicked([]); setNext(null); callApi(`/placement/memorization-check?surah=${s}`, "GET").then(setCheck).catch(() => setErr(t("تعذر التحميل.", "Could not load."))); }}>
            <div className="min-w-48 flex-1"><label htmlFor="pl-ms" className="label">{t("اختر سورة تحفظها", "Choose a surah you know")}</label><select id="pl-ms" name="surah" className="input" defaultValue={(i.memorizedFromSurah as number) ?? 114}>{surahs.map((s) => <option key={s.id} value={s.id}>{s.id}. {s.name}</option>)}</select></div>
            <button className="btn btn-ghost">{t("ابدأ التحقق", "Start the check")}</button>
          </form>
          {check?.nextAyah && (
            <>
              <fieldset><legend className="font-semibold">{t("ما الآية التالية؟", "What is the next ayah?")}</legend><p className="font-quran my-2 text-xl" lang="ar" dir="rtl">{check.nextAyah.prompt}</p>{check.nextAyah.options.map((o) => <label key={o.id} className="flex min-h-11 items-start gap-2 font-quran text-lg" lang="ar"><input type="radio" name="nextAyah" className="mt-2 size-5" checked={next === o.id} onChange={() => setNext(o.id)} />{o.text}</label>)}</fieldset>
              <div><p className="font-semibold">{t("رتب الآيات حسب المصحف", "Order the ayahs as in the mushaf")}</p><ul className="mt-1 space-y-1">{check.order.map((o) => <li key={o.id}><button type="button" disabled={picked.includes(o.id)} lang="ar" className="btn btn-ghost h-auto w-full justify-start py-1 text-start font-quran" onClick={() => setPicked([...picked, o.id])}>{picked.includes(o.id) ? `${picked.indexOf(o.id) + 1}. ` : ""}{o.text}</button></li>)}</ul></div>
              <button type="button" className="btn btn-primary" disabled={!next || picked.length < check.order.length} onClick={() => go(() => callApi("/placement/memorization", "PUT", { surahId: check.surahId, promptId: check.nextAyah!.promptId, chosenId: next, orderIds: picked }), 4).then(() => setCheck(null))}>{t("حفظ الإجابات", "Save answers")}</button>
            </>
          )}
          <div><p className="mb-1 font-semibold">{t("سمّع من حفظك ما تيسر", "Recite what you can from memory")}</p><AudioUpload path="/placement/audio" extra={{ stage: "memorization" }} onDone={() => router.refresh()} />{initial.memorizationFileId && <p className="mt-1 text-sm text-ok">{t("أرسل تسجيل الحفظ.", "Memorization recording sent.")}</p>}</div>
          <button type="button" className="btn btn-primary" onClick={() => setStage(5)}>{t("متابعة", "Continue")}</button>
        </div>
      )}
      {stage === 5 && (
        <div className="card space-y-3">
          <h2 className="text-xl text-brand">{t("مراجعة قبل الإرسال", "Review before sending")}</h2>
          <ul className="space-y-1 text-sm">
            <li>{t("الملف الأولي", "Profile")}: {i.ageGroup ? "✓" : t("غير مكتمل", "Incomplete")}</li>
            <li>{t("تسجيل القراءة", "Reading recording")}: {initial.readingFileId ? "✓" : t("لم يرسل", "Not sent")}</li>
            <li>{t("أسئلة التجويد", "Tajweed questions")}: {Object.keys(initial.tajweedAnswers).length ? "✓" : t("لم تجب", "Not answered")}</li>
            <li>{t("تسجيل الحفظ", "Memorization recording")}: {initial.memorizationFileId ? "✓" : t("لم يرسل", "Not sent")}</li>
          </ul>
          <p className="text-sm text-ink-2">{t("بعد الإرسال يراجع المعلم إجاباتك وتسجيلاتك، ثم يعتمد مستواك ومسارك.", "After sending, a teacher reviews your answers and recordings, then confirms your level and track.")}</p>
          <button type="button" className="btn btn-primary" onClick={() => go(() => callApi("/placement/submit", "POST"), 5)}>{t("إرسال للمعلم", "Send to teacher")}</button>
        </div>
      )}
    </div>
  );
}

// ---------- Exam runner ----------
type EQ = { id: string; type: string; promptAr: string; promptEn: string | null; options: { key: string; textAr: string; textEn?: string }[] | null; points: number };
export function ExamRunner({ attemptId, questions, answers, expiresAt, backHref }: { attemptId: string; questions: EQ[]; answers: { questionId: string; selectedKey: string | null; textAnswer: string | null; fileId: string | null }[]; expiresAt: string | null; backHref: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [saved, setSaved] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [order, setOrder] = useState<Record<string, string[]>>(() => Object.fromEntries(answers.filter((a) => a.textAnswer?.includes(",")).map((a) => [a.questionId, a.textAnswer!.split(",")])));
  const [err, setErr] = useState<string | null>(null);
  const given = useMemo(() => new Map(answers.map((a) => [a.questionId, a])), [answers]);
  const finish = async () => {
    try { await callApi(`/exams/${attemptId}/finish`, "POST"); router.push(backHref); router.refresh(); } catch { setErr(t("تعذر التسليم.", "Could not submit.")); }
  };
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setLeft(Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  const save = async (questionId: string, body: { selectedKey?: string; textAnswer?: string }) => {
    try { await callApi(`/exams/${attemptId}/answer`, "PUT", { questionId, ...body }); setSaved(t("حفظ تلقائياً", "Saved automatically")); }
    catch (e) { setSaved(null); setErr((e as { code?: string }).code === "time_expired" ? t("انتهى الوقت.", "Time is up.") : t("تعذر الحفظ. تحقق من الاتصال.", "Could not save. Check your connection.")); }
  };
  return (
    <div className="space-y-4">
      <div className="card sticky top-16 z-10 flex flex-wrap items-center justify-between gap-2 py-2">
        <span aria-live="off" className="font-bold">{left !== null ? `${t("الوقت المتبقي", "Time left")}: ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : ""}</span>
        <span aria-live="polite" className="text-sm text-ok">{saved}</span>
      </div>
      {questions.map((q, n) => {
        const prompt = locale === "en" && q.promptEn ? q.promptEn : q.promptAr;
        const a = given.get(q.id);
        const txt = (o: { textAr: string; textEn?: string }) => (locale === "en" && o.textEn ? o.textEn : o.textAr);
        return (
          <fieldset key={q.id} className="card">
            <legend className="px-1 font-semibold">{n + 1}. {prompt}</legend>
            {(q.type === "MULTIPLE_CHOICE" || q.type === "TRUE_FALSE") && q.options?.map((o) => <label key={o.key} className="flex min-h-11 items-center gap-2"><input type="radio" name={q.id} className="size-5" defaultChecked={a?.selectedKey === o.key} onChange={() => save(q.id, { selectedKey: o.key })} />{txt(o)}</label>)}
            {(q.type === "COMPLETE_TEXT" || q.type === "PRACTICAL") && <><label htmlFor={`e-${q.id}`} className="sr-only">{prompt}</label><textarea id={`e-${q.id}`} rows={3} lang="ar" className="input mt-2" defaultValue={a?.textAnswer ?? ""} onBlur={(e) => save(q.id, { textAnswer: e.target.value })} /></>}
            {q.type === "ORDER" && <div className="mt-2 space-y-1">{q.options?.map((o) => { const cur = order[q.id] ?? []; return <button key={o.key} type="button" disabled={cur.includes(o.key)} className="btn btn-ghost h-auto w-full justify-start py-1 text-start" onClick={() => { const nx = [...cur, o.key]; setOrder({ ...order, [q.id]: nx }); save(q.id, { textAnswer: nx.join(",") }); }}>{cur.includes(o.key) ? `${cur.indexOf(o.key) + 1}. ` : ""}{txt(o)}</button>; })}<button type="button" className="text-sm underline" onClick={() => { setOrder({ ...order, [q.id]: [] }); save(q.id, { textAnswer: "" }); }}>{t("إعادة الترتيب", "Reset order")}</button></div>}
            {q.type === "RECITATION" && <div className="mt-2">{a?.fileId && <p className="mb-1 text-sm text-ok">{t("أرسل تسجيل.", "A recording was sent.")}</p>}<AudioUpload path={`/exams/${attemptId}/audio`} extra={{ questionId: q.id }} onDone={() => setSaved(t("حفظ التسجيل", "Recording saved"))} /></div>}
            {q.type === "ORAL" && <p className="mt-2 text-sm text-ink-2">{t("يقيمها المحكم شفهياً في الموعد.", "The judge assesses this orally at the set time.")}</p>}
          </fieldset>
        );
      })}
      {err && <p role="alert" className="text-danger">{err}</p>}
      <button type="button" className="btn btn-primary" onClick={finish}>{t("تسليم نهائي", "Final submission")}</button>
    </div>
  );
}

// ---------- Lesson quiz ----------
export function LessonQuiz({ slug, questions, canSubmit }: { slug: string; questions: PQ[]; canSubmit: boolean }) {
  const { t, locale } = useI18n();
  const [r, setR] = useState<{ scorePercent: number; right: number; total: number } | null>(null);
  const [err, setErr] = useState(false);
  return (
    <form onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); setErr(false); try { setR(await callApi(`/lessons/${slug}/quiz`, "POST", { answers: Object.fromEntries(questions.map((q) => [q.id, String(f.get(q.id) ?? "")])) })); } catch { setErr(true); } }} className="space-y-3">
      {questions.map((q) => <fieldset key={q.id}><legend className="font-semibold">{locale === "en" && q.promptEn ? q.promptEn : q.promptAr}</legend>{q.options?.map((o) => <label key={o.key} className="flex min-h-11 items-center gap-2"><input type="radio" required name={q.id} value={o.key} className="size-5" />{locale === "en" && o.textEn ? o.textEn : o.textAr}</label>)}</fieldset>)}
      {canSubmit ? <button className="btn btn-primary btn-sm">{t("تحقق", "Check")}</button> : <p className="text-sm text-ink-2">{t("سجل الدخول طالباً لحفظ نتيجتك.", "Sign in as a student to save your result.")}</p>}
      <span aria-live="polite" className="ms-2 text-sm">{r && t(`النتيجة: ${r.right} من ${r.total}`, `Result: ${r.right} of ${r.total}`)}{err && <span className="text-danger">{t("تعذر الإرسال.", "Could not send.")}</span>}</span>
    </form>
  );
}
