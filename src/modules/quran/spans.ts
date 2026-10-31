// Browser-safe subset of text.ts: no Node imports.
export type TajweedSpan = [start: number, end: number, code: string];

/** Splits text into coloured segments. Concatenating them always reproduces `text`. */
export function applySpans(text: string, spans: TajweedSpan[]): { text: string; code: string | null }[] {
  const out: { text: string; code: string | null }[] = [];
  let pos = 0;
  for (const [s, e, code] of spans) {
    if (s > pos) out.push({ text: text.slice(pos, s), code: null });
    out.push({ text: text.slice(s, e), code });
    pos = e;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), code: null });
  return out;
}
