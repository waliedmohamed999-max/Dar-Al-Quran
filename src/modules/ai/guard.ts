// Safety rules for AI answers. Pure and independently tested: the model is never trusted to follow them.
import { skeleton } from "../quran/text";

const RULING = /(يجوز|حلال|حرام|فتوى|فتوي|كفارة|طلاق|زكاة|ميراث|\bfatwa\b|\bhalal\b|\bharam\b|is it permissible)/i;

/** Questions of religious ruling always go to a qualified person. */
export const asksForRuling = (q: string) => RULING.test(q);

/** Marks specific to Quranic script. Ayah text may only enter an answer through a [[s:a]] token. */
const QURAN_MARKS = /[ٰۖ-ۭ﴾﴿]/;

export type ModelAnswer = { answer: string; citations: string[]; needsTeacher: boolean };

export function validateAnswer(m: ModelAnswer, allowedSources: string[], sourceText: string): { ok: true } | { ok: false; reason: string } {
  if (m.needsTeacher) return { ok: false, reason: "model_deferred" };
  if (!m.answer.trim()) return { ok: false, reason: "empty" };
  if (m.citations.length === 0) return { ok: false, reason: "no_citation" };
  if (m.citations.some((c) => !allowedSources.includes(c))) return { ok: false, reason: "unknown_citation" };
  if (QURAN_MARKS.test(m.answer)) return { ok: false, reason: "quran_text_outside_token" };
  const known = skeleton(sourceText);
  for (const q of m.answer.matchAll(/[«"“]([^»"”]{12,})[»"”]/g)) {
    if (!known.includes(skeleton(q[1]))) return { ok: false, reason: "unsourced_quotation" };
  }
  return { ok: true };
}

/** Replaces [[s:a]] with verbatim stored text. Unknown references fail rather than pass through. */
export function expandAyahTokens(answer: string, ayahs: Map<string, string>): string | null {
  let bad = false;
  const out = answer.replace(/\[\[(\d{1,3}:\d{1,3})\]\]/g, (_, key: string) => {
    const text = ayahs.get(key);
    if (!text) { bad = true; return ""; }
    return `﴿${text}﴾ [${key}]`;
  });
  return bad ? null : out;
}

/** Revision pace suggestion from records. A teacher reviews and saves it; nothing applies itself. */
export function suggestNextPlan(i: { donePercent: number | null; mastery: number | null; newAyahsPerDay: number }) {
  if (i.donePercent === null || i.mastery === null) return { newAyahsPerDay: i.newAyahsPerDay, reason: "insufficient_data" as const };
  if (i.donePercent < 50 || i.mastery < 3) return { newAyahsPerDay: Math.max(1, i.newAyahsPerDay - 1), reason: "consolidate" as const };
  if (i.donePercent >= 85 && i.mastery >= 4) return { newAyahsPerDay: Math.min(40, i.newAyahsPerDay + 1), reason: "advance" as const };
  return { newAyahsPerDay: i.newAyahsPerDay, reason: "steady" as const };
}
