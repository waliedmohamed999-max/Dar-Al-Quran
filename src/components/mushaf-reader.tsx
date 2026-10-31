"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Bookmark, Focus, Heart, Pause, Play, Repeat, SkipBack, SkipForward } from "lucide-react";
import dynamic from "next/dynamic";
import { callApi, useI18n } from "./client";
import { hiddenWordIndexes } from "@/modules/hadith/exercises";
import { applySpans, type TajweedSpan } from "@/modules/quran/spans";

// Loaded only when opened, so reading pages do not carry it.
const ReciteMode = dynamic(() => import("./recite").then((m) => m.ReciteMode), { ssr: false });

export type ReaderAyah = {
  id: number; surahId: number; ayahNumber: number; text: string; page: number; juz: number; hizb: number; sajda: boolean; spans: TajweedSpan[] | null;
};
export type ReaderSurah = { id: number; nameArabic: string; nameEnglish: string; bismillahPre: boolean; ayahCount: number };
export type ReaderRecitation = { slug: string; urlTemplate: string; nameAr: string; nameEn: string; style: string | null };

type Mode = "read" | "listen" | "memorize" | "recite" | "tajweed" | "tafsir" | "study";
const MODES: [Mode, string, string][] = [["read", "قراءة", "Read"], ["listen", "استماع", "Listen"], ["memorize", "حفظ", "Memorize"], ["recite", "تسميع", "Recite"], ["tajweed", "تجويد", "Tajweed"], ["tafsir", "تفسير", "Tafsir"], ["study", "دراسة", "Study"]];
const LEGEND: [string, string, string][] = [
  ["n", "مد طبيعي", "Natural madd"], ["o", "مد متصل", "Connected madd"], ["p", "مد منفصل", "Separated madd"], ["m", "مد لازم", "Necessary madd"],
  ["g", "غنة", "Ghunnah"], ["a", "إدغام بغنة", "Idgham with ghunnah"], ["u", "إدغام بغير غنة", "Idgham without ghunnah"], ["f", "إخفاء", "Ikhfa"],
  ["i", "إقلاب", "Iqlab"], ["c", "إخفاء شفوي", "Labial ikhfa"], ["w", "إدغام شفوي", "Labial idgham"], ["q", "قلقلة", "Qalqalah"], ["h", "همزة وصل / لام شمسية / حرف لا ينطق", "Connecting hamzah, sun letter, silent letter"],
];
type WordRule = { slug: string; titleAr: string; titleEn: string; bodyAr: string; bodyEn: string };

const audioUrl = (tpl: string, a: ReaderAyah) =>
  tpl.replace("{sss}", String(a.surahId).padStart(3, "0")).replace("{aaa}", String(a.ayahNumber).padStart(3, "0")).replace("{n}", String(a.id));

/** Tokenizes without changing a character: the rendered text always concatenates back to the source. */
function tokens(text: string) {
  const out: { word: boolean; text: string; start: number }[] = [];
  for (const m of text.matchAll(/\s+|\S+/g)) out.push({ word: !/^\s/.test(m[0]), text: m[0], start: m.index });
  return out;
}

export function MushafReader({ ayahs, surahs, recitations, signedIn, initialAyahId, pageMode, basmala, canTrack, reciteAllowed = true }: {
  basmala: string; ayahs: ReaderAyah[]; surahs: ReaderSurah[]; recitations: ReaderRecitation[]; signedIn: boolean; initialAyahId?: number; pageMode?: boolean; canTrack?: boolean; reciteAllowed?: boolean;
}) {
  const { t, locale } = useI18n();
  const audio = useRef<HTMLAudioElement>(null);
  const [mode, setMode] = useState<Mode>("read");
  const [reciter, setReciter] = useState(recitations[0]?.slug ?? "");
  const [repeat, setRepeat] = useState(1);
  const [rangeRepeat, setRangeRepeat] = useState(1);
  const [rangeFrom, setRangeFrom] = useState<number | "">("");
  const [rangeTo, setRangeTo] = useState<number | "">("");
  const [speed, setSpeed] = useState(1);
  const [fontSize, setFontSize] = useState(1.75);
  const [focus, setFocus] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [spanMap, setSpanMap] = useState<Record<number, TajweedSpan[]> | null>(null);
  useEffect(() => {
    if ((mode !== "tajweed" && mode !== "study") || spanMap || !ayahs.length) return;
    callApi(`/quran/spans?from=${ayahs[0].id}&to=${ayahs[ayahs.length - 1].id}`, "GET").then(setSpanMap).catch(() => undefined);
  }, [mode, spanMap, ayahs]);
  const [segments, setSegments] = useState<[number, number, number, number][] | null>(null);
  const [activeWord, setActiveWord] = useState<[number, number] | null>(null);
  const [selected, setSelected] = useState<ReaderAyah | null>(ayahs.find((a) => a.id === initialAyahId) ?? null);
  const [hidePercent, setHidePercent] = useState(50);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [wordRules, setWordRules] = useState<WordRule[] | null>(null);
  const played = useRef(0);
  const loops = useRef(0);

  const recitation = recitations.find((r) => r.slug === reciter);
  const bounds = useCallback(() => {
    const from = rangeFrom === "" ? 0 : ayahs.findIndex((a) => a.ayahNumber === rangeFrom);
    const toFound = rangeTo === "" ? -1 : ayahs.findIndex((a) => a.ayahNumber === rangeTo);
    return { from: Math.max(0, from), to: toFound < 0 ? ayahs.length - 1 : toFound };
  }, [ayahs, rangeFrom, rangeTo]);

  const playIdx = useCallback((idx: number) => {
    const a = ayahs[idx];
    const el = audio.current;
    if (!a || !el || !recitation) return;
    played.current = 0;
    setActiveIdx(idx);
    setAudioError(false);
    el.src = audioUrl(recitation.urlTemplate, a);
    el.playbackRate = speed;
    setSegments(null);
    setActiveWord(null);
    callApi(`/quran/word-timings?recitation=${recitation.slug}&surah=${a.surahId}&ayah=${a.ayahNumber}`, "GET").then((r) => setSegments(r?.segments ?? null)).catch(() => undefined);
    el.play().catch(() => setAudioError(true));
    document.getElementById(`a-${a.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    if (signedIn) callApi("/me/position", "PUT", { ayahId: a.id }).catch(() => undefined);
  }, [ayahs, recitation, speed, signedIn]);

  // Each ayah has its own audio file, so "ended" marks exactly where the ayah finishes.
  const onEnded = () => {
    if (activeIdx === null) return;
    played.current += 1;
    if (repeat === 0 || played.current < repeat) {
      audio.current!.currentTime = 0;
      audio.current!.play().catch(() => setAudioError(true));
      return;
    }
    const { from, to } = bounds();
    if (activeIdx < to) return playIdx(activeIdx + 1);
    loops.current += 1;
    if (rangeRepeat === 0 || loops.current < rangeRepeat) return playIdx(from);
    loops.current = 0;
    setPlaying(false);
    setActiveIdx(null);
  };

  useEffect(() => { if (audio.current) audio.current.playbackRate = speed; }, [speed]);
  useEffect(() => { if (initialAyahId) document.getElementById(`a-${initialAyahId}`)?.scrollIntoView({ block: "center" }); }, [initialAyahId]);

  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    loops.current = 0;
    if (playing) el.pause();
    else if (activeIdx === null) playIdx(selected && rangeFrom === "" ? ayahs.findIndex((a) => a.id === selected.id) : bounds().from);
    else el.play().catch(() => setAudioError(true));
  };

  const surahById = new Map(surahs.map((s) => [s.id, s]));
  const select = (a: ReaderAyah, idx: number) => {
    setSelected(a);
    if (mode === "listen" || mode === "study") playIdx(idx);
    else if (signedIn) callApi("/me/position", "PUT", { ayahId: a.id }).catch(() => undefined);
  };

  const openWord = (a: ReaderAyah, start: number, end: number) => {
    setSelected(a);
    callApi(`/quran/ayahs/${a.id}/word-rules?start=${start}&end=${end}`, "GET").then(setWordRules).catch(() => setWordRules([]));
  };

  const renderAyah = (a: ReaderAyah): ReactNode => {
    const spans = mode === "tajweed" || mode === "study" ? spanMap?.[a.id] : undefined;
    const colored = Boolean(spans);
    const live = activeIdx !== null && ayahs[activeIdx]?.id === a.id ? activeWord : null;
    if (mode === "read" || mode === "tafsir" || (mode === "listen" && !live)) return a.text;
    const parts = tokens(a.text);
    const hide = mode === "memorize" ? hiddenWordIndexes(parts.filter((p) => p.word).length, hidePercent, a.id) : new Set<number>();
    let w = -1;
    return parts.map((p, i) => {
      if (!p.word) return p.text;
      w += 1;
      const lit = live && w >= live[0] && w < live[1] ? " word-live" : "";
      if (mode === "listen") return <span key={i} className={lit.trim() || undefined}>{p.text}</span>;
      const key = `${a.id}:${i}`;
      const inner = colored
        ? applySpans(p.text, spans!.filter(([s, e]) => s < p.start + p.text.length && e > p.start).map(([s, e, c]) => [Math.max(s, p.start) - p.start, Math.min(e, p.start + p.text.length) - p.start, c] as TajweedSpan)).map((seg, k) => (seg.code ? <span key={k} className={`tj-${seg.code}`}>{seg.text}</span> : seg.text))
        : p.text;
      if (mode === "memorize") {
        const hidden = hide.has(w) && !revealed.has(key);
        return <span key={i} className={`${hidden ? "word-hidden" : ""}${lit}`} onClick={(e) => { e.stopPropagation(); setRevealed(new Set(revealed).add(key)); }}>{inner}</span>;
      }
      return <span key={i} className={`word${lit}`} role="button" tabIndex={0} aria-label={t("أحكام هذه الكلمة", "Rules for this word")} onClick={(e) => { e.stopPropagation(); openWord(a, p.start, p.start + p.text.length); }} onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); openWord(a, p.start, p.start + p.text.length); } }}>{inner}</span>;
    });
  };
  const wordsAreInteractive = mode === "tajweed" || mode === "study";
  const showAudio = mode === "listen" || mode === "memorize" || mode === "study";
  const showPanel = mode === "tafsir" || mode === "study" || mode === "tajweed" || mode === "read";

  return (
    <div className={`grid gap-5 ${focus ? "" : "lg:grid-cols-[minmax(0,1fr)_21rem]"}`} style={{ "--quran-size": `${fontSize}rem` } as React.CSSProperties}>
      <div className={focus ? "mx-auto w-full max-w-4xl" : ""}>
        <div className="no-print mb-3 flex flex-wrap gap-1.5" role="group" aria-label={t("أوضاع المصحف", "Mushaf modes")}>
          {MODES.map(([m, ar, en]) => <button key={m} type="button" aria-pressed={mode === m} className={`btn btn-sm ${mode === m ? "btn-primary" : "btn-ghost"}`} onClick={() => { setMode(m); setRevealed(new Set()); setWordRules(null); }}>{locale === "ar" ? ar : en}</button>)}
          <button type="button" className="btn btn-ghost btn-sm" aria-pressed={focus} onClick={() => setFocus(!focus)}><Focus className="size-4" aria-hidden="true" />{t("تركيز", "Focus")}</button>
        </div>
        {mode === "recite" && <ReciteMode ayahs={ayahs} startId={selected?.id} signedIn={signedIn} allowed={reciteAllowed} />}
        <div className={pageMode ? "mushaf-page" : "card"} hidden={mode === "recite"}>
          <div className="quran" lang="ar" dir="rtl">
            {ayahs.map((a, i) => {
              const s = surahById.get(a.surahId);
              return (
                <span key={a.id}>
                  {a.ayahNumber === 1 && s && (
                    <span className="block">
                      <span className="surah-head block">{`سورة ${s.nameArabic}`}</span>
                      {s.bismillahPre && <span className="basmala block" aria-label="البسملة">{basmala}</span>}
                    </span>
                  )}
                  <span
                    id={`a-${a.id}`}
                    className="ayah"
                    {...(wordsAreInteractive ? {} : { role: "button", tabIndex: 0, "aria-label": t(`الآية ${a.ayahNumber}`, `Ayah ${a.ayahNumber}`) })}
                    data-active={activeIdx === i}
                    data-selected={selected?.id === a.id}
                    onClick={() => select(a, i)}
                    onKeyDown={(e) => { if (!wordsAreInteractive && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(a, i); } }}
                  >
                    {renderAyah(a)}
                  </span>
                  <span className="ayah-end" aria-hidden="true">{a.ayahNumber}</span>{" "}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {!focus && <aside className="order-first space-y-4 lg:order-none lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto" aria-label={t("أدوات المصحف", "Mushaf tools")}>
        <div className="card space-y-3">
          <div>
            <label htmlFor="fsize" className="label">{t("حجم الخط", "Text size")}</label>
            <input id="fsize" type="range" min={1.25} max={3} step={0.25} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="w-full" />
          </div>
          <div hidden={!showAudio} className="space-y-3">
            <div>
              <label htmlFor="reciter" className="label">{t("القارئ", "Reciter")}</label>
              <select id="reciter" className="input" value={reciter} onChange={(e) => { setReciter(e.target.value); audio.current?.pause(); setActiveIdx(null); }}>
                {recitations.map((r) => <option key={r.slug} value={r.slug}>{locale === "ar" ? r.nameAr : r.nameEn}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-center gap-2">
              <button type="button" className="btn btn-ghost btn-sm" aria-label={t("الآية السابقة", "Previous ayah")} onClick={() => activeIdx !== null && activeIdx > 0 && playIdx(activeIdx - 1)}><SkipForward className="size-4 ltr:rotate-180" aria-hidden="true" /></button>
              <button type="button" className="btn btn-primary" onClick={toggle} aria-label={playing ? t("إيقاف مؤقت", "Pause") : t("تشغيل", "Play")}>{playing ? <Pause className="size-5" aria-hidden="true" /> : <Play className="size-5" aria-hidden="true" />}</button>
              <button type="button" className="btn btn-ghost btn-sm" aria-label={t("الآية التالية", "Next ayah")} onClick={() => activeIdx !== null && activeIdx + 1 < ayahs.length && playIdx(activeIdx + 1)}><SkipBack className="size-4 ltr:rotate-180" aria-hidden="true" /></button>
            </div>
            {segments && <p className="text-xs text-ink-2">{t("تمييز الكلمات تقديري من بيانات توقيت آلية: quran-align، برخصة CC BY 4.0.", "Word highlighting is approximate, from automated timing data: quran-align, CC BY 4.0.")}</p>}
            {audioError && <p role="alert" className="text-sm text-danger">{t("تعذر تشغيل الصوت. تحقق من الاتصال أو جرّب قارئاً آخر.", "Could not play audio. Check your connection or try another reciter.")}</p>}
            {activeIdx !== null && <p aria-live="polite" className="text-center text-sm text-ink-2">{t("الآية الجارية", "Now playing")}: <bdi>{ayahs[activeIdx].surahId}:{ayahs[activeIdx].ayahNumber}</bdi></p>}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="repeat" className="label flex items-center gap-1"><Repeat className="size-3.5" aria-hidden="true" />{t("تكرار الآية", "Repeat ayah")}</label>
                <select id="repeat" className="input" value={repeat} onChange={(e) => setRepeat(Number(e.target.value))}>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                  <option value={0}>{t("بلا حد", "Unlimited")}</option>
                </select>
              </div>
              <div>
                <label htmlFor="speed" className="label">{t("السرعة", "Speed")}</label>
                <select id="speed" className="input" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>{[0.5, 0.75, 1, 1.25, 1.5].map((n) => <option key={n} value={n}>{n}x</option>)}</select>
              </div>
              <div><label htmlFor="rf" className="label">{t("من الآية", "From ayah")}</label><input id="rf" type="number" min={1} className="input" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value ? Number(e.target.value) : "")} /></div>
              <div><label htmlFor="rt" className="label">{t("إلى الآية", "To ayah")}</label><input id="rt" type="number" min={1} className="input" value={rangeTo} onChange={(e) => setRangeTo(e.target.value ? Number(e.target.value) : "")} /></div>
              <div className="col-span-2">
                <label htmlFor="rr" className="label">{t("تكرار النطاق", "Repeat range")}</label>
                <select id="rr" className="input" value={rangeRepeat} onChange={(e) => setRangeRepeat(Number(e.target.value))}>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                  <option value={0}>{t("بلا حد", "Unlimited")}</option>
                </select>
              </div>
            </div>
          </div>
          <audio ref={audio} preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setActiveWord(null); onEnded(); }} onTimeUpdate={(e) => { const ms = e.currentTarget.currentTime * 1000; const seg = segments?.find((x) => ms >= x[2] && ms < x[3]); setActiveWord(seg ? [seg[0], seg[1]] : null); }} onError={() => { if (activeIdx !== null) setAudioError(true); }} />

          {mode === "memorize" && (
            <div className="space-y-2 border-t border-line pt-3">
              <label htmlFor="hide" className="label">{t(`إخفاء الكلمات: ${hidePercent}%`, `Hide words: ${hidePercent}%`)}</label>
              <input id="hide" type="range" min={0} max={100} step={10} value={hidePercent} onChange={(e) => { setHidePercent(Number(e.target.value)); setRevealed(new Set()); }} className="w-full" />
              <p className="text-xs text-ink-2">{t("اضغط كلمة لإظهارها. عدد مرات الاستماع لا يعني الإتقان؛ يعتمده معلمك.", "Tap a word to reveal it. Listening counts do not mean mastery; your teacher confirms it.")}</p>
              <OrderExercise ayahs={ayahs} from={selected ? ayahs.findIndex((a) => a.id === selected.id) : 0} />
              {canTrack && selected && <TrackAyah ayah={selected} />}
            </div>
          )}
          {(mode === "tajweed" || mode === "study") && (
            <div className="border-t border-line pt-3 text-xs">
              <p className="mb-1 text-warn">{t("تمييز آلي من مصدر مفتوح، لم يكتمل تدقيقه من مختص، والمعوّل عليه هو المعلم.", "Automated open-source annotation, not yet fully reviewed by a specialist. Rely on your teacher.")}</p>
              <ul className="grid grid-cols-2 gap-x-2">{LEGEND.map(([c, ar, en]) => <li key={c} className={`tj-${c} font-semibold`}>{t(ar, en)}</li>)}</ul>
              <p className="mt-1 text-ink-2">{t("اضغط كلمة لعرض أحكامها.", "Tap a word to see its rules.")}</p>
            </div>
          )}
        </div>
        {wordRules && (
          <div className="card" aria-live="polite">
            <h2 className="mb-1 font-semibold text-brand">{t("أحكام الكلمة", "Word rules")}</h2>
            {wordRules.length === 0 ? <p className="text-sm text-ink-2">{t("لا يوجد حكم معتمد مربوط بهذه الكلمة.", "No approved rule is linked to this word.")}</p> : wordRules.map((r) => <div key={r.slug} className="mb-2 text-sm"><Link className="font-semibold underline" href={locale === "ar" ? `/tajweed/${r.slug}` : `/en/tajweed/${r.slug}`}>{locale === "ar" ? r.titleAr : r.titleEn}</Link><p className="text-ink-2">{locale === "ar" ? r.bodyAr : r.bodyEn}</p></div>)}
          </div>
        )}
        {selected && showPanel && <AyahPanel ayah={selected} surah={surahById.get(selected.surahId)} signedIn={signedIn} canTrack={canTrack && mode === "study"} />}
      </aside>}
    </div>
  );
}

function OrderExercise({ ayahs, from }: { ayahs: ReaderAyah[]; from: number }) {
  const { t } = useI18n();
  const start = Math.max(0, Math.min(from, Math.max(0, ayahs.length - 3)));
  const set = ayahs.slice(start, start + 3);
  const [picked, setPicked] = useState<number[]>([]);
  useEffect(() => setPicked([]), [start]);
  if (set.length < 2) return null;
  // Longest first gives a stable order unrelated to the mushaf sequence.
  const shown = [...set].sort((a, b) => b.text.length - a.text.length || b.id - a.id);
  const done = picked.length === set.length;
  const correct = done && picked.every((id, i) => id === set[i].id);
  return (
    <details>
      <summary className="cursor-pointer text-sm font-semibold">{t("تدريب ترتيب الآيات", "Ayah order exercise")}</summary>
      <p className="my-1 text-xs text-ink-2">{t("اضغط الآيات بترتيبها في المصحف.", "Tap the ayahs in mushaf order.")}</p>
      <ul className="space-y-1">{shown.map((a) => <li key={a.id}><button type="button" disabled={picked.includes(a.id)} className="btn btn-ghost btn-sm h-auto w-full justify-start py-1 font-quran" lang="ar" onClick={() => setPicked([...picked, a.id])}>{picked.includes(a.id) ? `${picked.indexOf(a.id) + 1}. ` : ""}{a.text.split(" ").slice(0, 6).join(" ")}…</button></li>)}</ul>
      {done && <p aria-live="polite" className={`mt-1 text-sm ${correct ? "text-ok" : "text-warn"}`}>{correct ? t("ترتيب صحيح.", "Correct order.") : t("راجع الترتيب وحاول ثانية.", "Check the order and try again.")} <button type="button" className="underline" onClick={() => setPicked([])}>{t("إعادة", "Reset")}</button></p>}
    </details>
  );
}

function TrackAyah({ ayah }: { ayah: ReaderAyah }) {
  const { t, lp } = useI18n();
  const [msg, setMsg] = useState<string | null>(null);
  const set = async (status: string) => {
    try { await callApi("/me/ayah-status", "PUT", { surahId: ayah.surahId, fromAyah: ayah.ayahNumber, toAyah: ayah.ayahNumber, status }); setMsg(t("تم التحديث.", "Updated.")); } catch { setMsg(t("تعذر التحديث.", "Could not update.")); }
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => set("PRACTICING")}>{t("قيد التدريب", "Practising")}</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => set("READY")}>{t("جاهزة للتسميع", "Ready to recite")}</button>
      <Link className="btn btn-ghost btn-sm" href={lp(`/student/recitations?surah=${ayah.surahId}&from=${ayah.ayahNumber}&to=${ayah.ayahNumber}`)}>{t("تسجيل محاولة", "Record")}</Link>
      <span aria-live="polite" className="text-xs text-ok">{msg}</span>
    </div>
  );
}

function AyahPanel({ ayah, surah, signedIn, canTrack }: { ayah: ReaderAyah; surah?: ReaderSurah; signedIn: boolean; canTrack?: boolean }) {
  const { t, locale, lp } = useI18n();
  const [tafsir, setTafsir] = useState<{ source: { slug: string; nameAr: string; nameEn: string; author: string }; text: string | null }[] | null>(null);
  const [rules, setRules] = useState<{ slug: string; titleAr: string; titleEn: string }[]>([]);
  const [src, setSrc] = useState(0);
  const [err, setErr] = useState(false);
  const [flag, setFlag] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [noteMsg, setNoteMsg] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setTafsir(null); setErr(false); setSrc(0); setFlag({}); setNote(""); setNoteMsg(null);
    callApi(`/quran/ayahs/${ayah.id}/tafsir`, "GET").then((d) => live && setTafsir(d)).catch(() => live && setErr(true));
    callApi(`/quran/ayahs/${ayah.id}/tajweed-rules`, "GET").then((d) => live && setRules(d)).catch(() => undefined);
    if (signedIn) callApi(`/me/notes/${ayah.id}`, "GET").then((d) => live && setNote(d?.body ?? "")).catch(() => undefined);
    return () => { live = false; };
  }, [ayah.id, signedIn]);

  const mark = async (kind: "FAVORITE" | "BOOKMARK") => {
    const r = await callApi("/me/bookmarks", "POST", { ayahId: ayah.id, kind });
    setFlag((f) => ({ ...f, [kind]: r.active }));
  };
  const current = tafsir?.[src];

  return (
    <div className="card" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg text-brand">{surah ? (locale === "ar" ? surah.nameArabic : surah.nameEnglish) : ""} : {ayah.ayahNumber}</h2>
        {signedIn && (
          <div className="flex gap-1">
            <button type="button" className="btn btn-ghost btn-sm" aria-pressed={flag.FAVORITE ?? false} aria-label={t("إضافة إلى المفضلة", "Add to favourites")} onClick={() => mark("FAVORITE")}><Heart className={`size-4 ${flag.FAVORITE ? "fill-current" : ""}`} aria-hidden="true" /></button>
            <button type="button" className="btn btn-ghost btn-sm" aria-pressed={flag.BOOKMARK ?? false} aria-label={t("علامة مرجعية", "Bookmark")} onClick={() => mark("BOOKMARK")}><Bookmark className={`size-4 ${flag.BOOKMARK ? "fill-current" : ""}`} aria-hidden="true" /></button>
          </div>
        )}
      </div>
      <p className="mt-1 text-xs text-ink-2">{t(`الجزء ${ayah.juz} · الحزب ${ayah.hizb} · الصفحة ${ayah.page}`, `Juz ${ayah.juz} · Hizb ${ayah.hizb} · Page ${ayah.page}`)}{ayah.sajda ? t(" · موضع سجدة", " · Prostration") : ""}</p>
      {canTrack && <div className="mt-2"><TrackAyah ayah={ayah} /></div>}

      <h3 className="mt-3 font-semibold">{t("التفسير", "Tafsir")}</h3>
      {err && <p role="alert" className="text-sm text-danger">{t("تعذر تحميل التفسير حالياً.", "Could not load tafsir right now.")}</p>}
      {!tafsir && !err && <div className="skeleton mt-2 h-24" aria-label={t("جار التحميل", "Loading")} />}
      {tafsir && tafsir.length === 0 && <p className="text-sm text-ink-2">{t("لا يوجد مصدر تفسير معتمد بعد.", "No tafsir source has been approved yet.")}</p>}
      {tafsir && tafsir.length > 0 && (
        <>
          <label htmlFor="tafsir-src" className="sr-only">{t("مصدر التفسير", "Tafsir source")}</label>
          <select id="tafsir-src" className="input mt-2" value={src} onChange={(e) => setSrc(Number(e.target.value))}>
            {tafsir.map((x, i) => <option key={x.source.slug} value={i}>{locale === "ar" ? x.source.nameAr : x.source.nameEn}</option>)}
          </select>
          <div className="mt-2 max-h-72 overflow-y-auto text-sm leading-7" lang="ar" dir="rtl" tabIndex={0}>
            {current?.text ?? <span className="text-ink-2">{t("غير متاح لهذه الآية في هذا المصدر.", "Not available for this ayah in this source.")}</span>}
          </div>
          <p className="mt-1 text-xs text-ink-2">{t("المصدر", "Source")}: {current?.source.nameAr} — {current?.source.author}</p>
        </>
      )}
      <p className="mt-2 text-xs text-ink-2">{t("معاني المفردات وأسباب النزول تظهر عند توفر مصدر محقق مرخص.", "Word meanings and occasions of revelation appear once a verified, licensed source exists.")}</p>

      <h3 className="mt-3 font-semibold">{t("أحكام التجويد في الآية", "Tajweed in this ayah")}</h3>
      {rules.length === 0 ? <p className="text-sm text-ink-2">{t("لا توجد أحكام مربوطة ومعتمدة لهذه الآية.", "No approved rules are linked to this ayah.")}</p> : (
        <ul className="mt-1 flex flex-wrap gap-1.5">{rules.map((r) => <li key={r.slug}><Link className="btn btn-ghost btn-sm" href={lp(`/tajweed/${r.slug}`)}>{locale === "ar" ? r.titleAr : r.titleEn}</Link></li>)}</ul>
      )}
      {signedIn && (
        <div className="mt-3">
          <label htmlFor="ayah-note" className="label">{t("ملاحظتي الخاصة", "My private note")}</label>
          <textarea id="ayah-note" className="input" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="button" className="btn btn-ghost btn-sm mt-1" onClick={() => callApi(`/me/notes/${ayah.id}`, "PUT", { body: note }).then(() => setNoteMsg(t("حفظت.", "Saved."))).catch(() => setNoteMsg(t("تعذر الحفظ.", "Could not save.")))}>{t("حفظ الملاحظة", "Save note")}</button>
          <span aria-live="polite" className="ms-2 text-xs text-ok">{noteMsg}</span>
        </div>
      )}
    </div>
  );
}
