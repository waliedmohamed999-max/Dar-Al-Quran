// Aligns recognized speech with the stored ayah words. Browser-safe. It decides only which stored word
// to reveal: recognized text is never displayed, and the result is a practice indicator, not an assessment.

const MARKS = /[ً-ٰٟۖ-ۭـ﻿​-‏͏]/g;

/** Uthmani and common spelling differ in long vowels and hamza carriers, so those are dropped before comparing. */
export function reciteKey(word: string): string {
  return word
    .normalize("NFD")
    .replace(MARKS, "")
    .replace(/[آأإءؤئاٱٲٳٵويىی]/g, "")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}]/gu, "");
}

function distance(a: string, b: string) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

/** Long words tolerate one recognizer slip. Short words must match, since one letter changes them entirely. */
export function wordsMatch(heard: string, target: string) {
  const a = reciteKey(heard), b = reciteKey(target);
  if (!a || !b) return false;
  if (a === b) return true;
  return Math.min(a.length, b.length) >= 4 && distance(a, b) <= 1;
}

export type WordState = "hidden" | "correct" | "missed";

/**
 * Pure and repeatable: called with the whole transcript on every speech event, because the recognizer
 * may rewrite its latest guess. A jump forward needs two words in a row, so one stray match cannot skip text.
 */
export function alignRecitation(targets: string[], heardText: string, lookahead = 6) {
  const heard = heardText.split(/\s+/).filter(Boolean);
  const states: WordState[] = targets.map(() => "hidden");
  let cursor = 0;
  let unmatched = 0;
  for (let h = 0; h < heard.length && cursor < targets.length; h++) {
    if (wordsMatch(heard[h], targets[cursor])) { states[cursor] = "correct"; cursor += 1; unmatched = 0; continue; }
    let jumped = false;
    for (let k = 1; k <= lookahead && cursor + k < targets.length; k++) {
      const next = targets[cursor + k + 1];
      if (wordsMatch(heard[h], targets[cursor + k]) && (next === undefined || (heard[h + 1] !== undefined && wordsMatch(heard[h + 1], next)))) {
        for (let m = cursor; m < cursor + k; m++) states[m] = "missed";
        states[cursor + k] = "correct";
        cursor += k + 1;
        jumped = true;
        unmatched = 0;
        break;
      }
    }
    if (!jumped) unmatched += 1;
  }
  return { states, cursor, unmatched, correct: states.filter((s) => s === "correct").length, missed: states.filter((s) => s === "missed").length };
}
