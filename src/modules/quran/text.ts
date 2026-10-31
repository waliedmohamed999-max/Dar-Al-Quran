// Pure text functions shared by the importer, verifier, search and renderer. No I/O.
import { createHash } from "node:crypto";
import { applySpans, type TajweedSpan } from "./spans";

export { applySpans, type TajweedSpan };

export const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

const MARKS = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\uFEFF\u200B-\u200F\u034F]/g;

/** Letter skeleton for comparison and search. Never displayed. */
export function skeleton(s: string): string {
  return s
    .normalize("NFD")
    .replace(MARKS, "")
    .replace(/[\u0622\u0623\u0625\u0671\u0672\u0673\u0675]/g, "\u0627")
    .replace(/[\u0649\u06CC]/g, "\u064A")
    .replace(/\u0624/g, "\u0648")
    .replace(/\u0626/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    .replace(/\u0621/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const BASMALA = "\u0628\u0633\u0645 \u0627\u0644\u0644\u0647 \u0627\u0644\u0631\u062D\u0645\u0646 \u0627\u0644\u0631\u062D\u064A\u0645";

/**
 * Tanzil's ayah 1 carries the Bismillah for surahs other than 1 and 9. It is a heading in the
 * mushaf, not part of the ayah, so only those four words are removed. Everything else is verbatim.
 */
export function separateBismillah(surah: number, ayah: number, raw: string): string {
  const text = raw.replace(/^\uFEFF/, "");
  if (ayah !== 1 || surah === 1 || surah === 9) return text;
  const words = text.split(" ");
  if (skeleton(words.slice(0, 4).join(" ")) !== BASMALA) {
    throw new Error(`expected Bismillah at ${surah}:1`);
  }
  return words.slice(4).join(" ");
}


const isMark = (c: string) => /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u200C\u200D\u034F\uFEFF\s]/.test(c);
const equalBase = (a: string, b: string) => skeleton(a) === skeleton(b);

/** Parses source markup such as `[h:12[ٱ]` into letters tagged with their rule code. */
function parseMarkup(markup: string): { ch: string; code: string | null }[] {
  const out: { ch: string; code: string | null }[] = [];
  let code: string | null = null;
  for (let i = 0; i < markup.length; ) {
    const open = markup.slice(i).match(/^\[([a-z])(?::\d+)?\[/);
    if (open) {
      code = open[1];
      i += open[0].length;
    } else if (markup[i] === "]") {
      code = null;
      i += 1;
    } else {
      out.push({ ch: markup[i], code });
      i += 1;
    }
  }
  return out;
}

/**
 * Projects rule annotations onto the canonical text by aligning base letters. The annotation
 * source uses a different encoding (for example U+0672 for the dagger alif), so its letters must
 * never be displayed. Returns null when the two do not align, and the ayah then shows uncoloured.
 */
export function alignTajweed(text: string, markup: string): TajweedSpan[] | null {
  const letters = parseMarkup(markup).filter((l) => !isMark(l.ch));
  const canon = [...text.matchAll(/[^\s]/g)].map((m) => ({ ch: m[0], i: m.index }));
  const baseCanon = canon.filter((c) => !isMark(c.ch));
  // The dagger alif is a mark in the canonical text but a letter (U+0672) in the source.
  const source = letters.filter((l) => l.ch !== "\u0672");
  const significant = source.filter((l) => skeleton(l.ch) !== "");
  const target = baseCanon.filter((c) => skeleton(c.ch) !== "");
  if (significant.length !== target.length) return null;

  const spans: TajweedSpan[] = [];
  for (let k = 0; k < target.length; k++) {
    if (!equalBase(significant[k].ch, target[k].ch)) return null;
    const code = significant[k].code;
    if (!code) continue;
    const start = target[k].i;
    let end = start + target[k].ch.length;
    while (end < text.length && isMark(text[end]) && !/\s/.test(text[end])) end += 1;
    const last = spans[spans.length - 1];
    if (last && last[2] === code && last[1] === start) last[1] = end;
    else spans.push([start, end, code]);
  }
  return spans;
}
