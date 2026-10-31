// Finds Quran quoted inside adhkar and compares it with the stored mushaf text. Advisory only:
// it never edits a dhikr, and a person decides what each difference means.
import { skeleton } from "../quran/text";

export type QuoteAyah = { surahId: number; ayahNumber: number; searchText: string };
export type QuoteMatch = { surahId: number; ayahNumber: number; words: number; ayahWords: number; kind: "FULL_AYAH" | "PARTIAL" };

const MIN_RUN = 5;

/**
 * Uthmani and common spelling differ (الصلوة, الصلاة), so comparison drops long-vowel alifs and waws/yas
 * written as carriers. A match here means "same letters in the same order", not "identical text".
 */
const loose = (s: string) => skeleton(s).replace(/[اوي]/g, "");
const wordsOf = (s: string) => loose(s.replace(/[^\p{L}\p{M}\s]/gu, " ")).split(" ").filter(Boolean);

export function buildQuoteIndex(ayahs: QuoteAyah[]) {
  const index = new Map<string, number[]>();
  const words = ayahs.map((a) => wordsOf(a.searchText));
  words.forEach((w, i) => {
    for (let k = 0; k + MIN_RUN <= w.length; k++) {
      const key = w.slice(k, k + MIN_RUN).join(" ");
      const list = index.get(key);
      if (list) list.push(i); else index.set(key, [i]);
    }
  });
  return { ayahs, words, index };
}

/** Longest run per ayah. Requires five consecutive words, so a shared phrase does not count as a quotation. */
export function findQuotes(text: string, q: ReturnType<typeof buildQuoteIndex>): QuoteMatch[] {
  const w = wordsOf(text);
  const best = new Map<number, number>();
  for (let i = 0; i + MIN_RUN <= w.length; i++) {
    for (const a of q.index.get(w.slice(i, i + MIN_RUN).join(" ")) ?? []) {
      const ay = q.words[a];
      for (let k = 0; k + MIN_RUN <= ay.length; k++) {
        let n = 0;
        while (i + n < w.length && k + n < ay.length && w[i + n] === ay[k + n]) n += 1;
        if (n >= MIN_RUN && n > (best.get(a) ?? 0)) best.set(a, n);
      }
    }
  }
  return [...best.entries()].sort((a, b) => a[0] - b[0]).map(([i, n]) => ({
    surahId: q.ayahs[i].surahId, ayahNumber: q.ayahs[i].ayahNumber, words: n, ayahWords: q.words[i].length, kind: n === q.words[i].length ? "FULL_AYAH" as const : "PARTIAL" as const,
  }));
}
