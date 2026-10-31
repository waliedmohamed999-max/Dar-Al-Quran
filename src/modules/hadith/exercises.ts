// Memorization exercises. Pure and browser-safe. They support practice only: mastery is always
// recorded by a teacher.

const MARKS = /[ً-ٰٟـ]/g;
const normalize = (s: string) => s.replace(MARKS, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ").trim();

/** Deterministic, so a hidden-word pattern stays stable between renders on server and client. */
export function hiddenWordIndexes(wordCount: number, percent: number, seed = 7): Set<number> {
  const out = new Set<number>();
  const target = Math.round((wordCount * Math.min(100, Math.max(0, percent))) / 100);
  for (let i = 0, j = seed; out.size < target && i < wordCount * 8; i++, j = (j * 31 + 17) % 9973) out.add(j % wordCount);
  return out;
}

/** Splits text at clause punctuation into segments for the ordering exercise. */
export function segments(text: string, maxSegments = 6): string[] {
  const parts = text.split(/(?<=[،,.:؛!؟])\s+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2 && parts.length <= maxSegments) return parts;
  const words = text.split(/\s+/);
  const n = Math.min(maxSegments, Math.max(2, Math.ceil(words.length / 10)));
  const size = Math.ceil(words.length / n);
  return Array.from({ length: n }, (_, i) => words.slice(i * size, (i + 1) * size).join(" ")).filter(Boolean);
}

/** Share of words recalled in order, ignoring diacritics. A practice indicator, not a grade. */
export function writtenRecallPercent(expected: string, written: string): number {
  const a = normalize(expected).split(" ").filter(Boolean);
  const b = normalize(written).split(" ").filter(Boolean);
  if (!a.length) return 0;
  const prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const t = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : Math.max(prev[j], prev[j - 1]);
      diag = t;
    }
  }
  return Math.round((prev[b.length] / a.length) * 100);
}
