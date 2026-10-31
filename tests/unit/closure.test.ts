import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildQuoteIndex, findQuotes } from "@/modules/adhkar/quotes";
import { completionParts } from "@/modules/hadith/final-exam";
import { aggregate, judgePercent, rank } from "@/modules/judging/service";
import { writeXlsx } from "@/modules/reports/xlsx";
import { actualMemorization, revisionPlan, suggestDifficulty } from "@/modules/unified/service";
import { skeleton } from "@/modules/quran/text";

describe("xlsx writer", () => {
  const read = (b: Buffer) => { const z = unzipSync(b); return Object.fromEntries(Object.entries(z).map(([k, v]) => [k, strFromU8(v)])); };
  it("writes a valid package with Arabic text, numbers and right-to-left view", () => {
    const f = read(writeXlsx("Students", ["الطالب", "الدرجة"], [["أحمد", 90], [null, 0]]));
    expect(Object.keys(f)).toContain("xl/worksheets/sheet1.xml");
    const sheet = f["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain('rightToLeft="1"');
    expect(sheet).toContain("أحمد");
    expect(sheet).toContain('<c r="B2"><v>90</v></c>');
    expect(sheet).toContain('<c r="B3"><v>0</v></c>');
    expect(sheet).toContain('<c r="A3"/>');
  });
  it("cannot produce a formula, and escapes markup and control characters", () => {
    const sheet = read(writeXlsx("T", ["a"], [["=HYPERLINK(1)"], ["-1+1"], ["@x"], ["<b>&\"\u0007"]]))["xl/worksheets/sheet1.xml"];
    expect(sheet).not.toContain("<f>");
    expect(sheet).toContain("'=HYPERLINK(1)");
    expect(sheet).toContain("'-1+1");
    expect(sheet).toContain("&lt;b&gt;&amp;&quot;");
    expect(sheet).not.toContain("\u0007");
  });
  it("sanitizes the sheet name", () => {
    expect(read(writeXlsx("a/b*c?d:e[f]", ["x"], []))["xl/workbook.xml"]).toContain('name="a b c d e f "');
  });
});

describe("oral judging scores", () => {
  const c = [{ id: "a", maxScore: 10, weight: 1 }, { id: "b", maxScore: 20, weight: 3 }];
  it("applies weights and maximums", () => {
    expect(judgePercent(c, new Map([["a", 10], ["b", 10]]))).toBeCloseTo(62.5);
  });
  it("is pending until every judge scored every criterion", () => {
    expect(judgePercent(c, new Map([["a", 10]]))).toBeNull();
    expect(aggregate(c, [new Map([["a", 10], ["b", 20]]), new Map([["a", 10]])]).percent).toBeNull();
  });
  it("averages judges and reports their spread", () => {
    expect(aggregate(c, [new Map([["a", 10], ["b", 20]]), new Map([["a", 5], ["b", 10]])])).toEqual({ percent: 75, spread: 50 });
  });
  it("gives equal scores the same rank", () => {
    expect(rank([{ percent: 80 }, { percent: 90 }, { percent: 80 }, { percent: 70 }]).map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });
});

describe("revision suggestions", () => {
  const now = new Date("2026-06-10T00:00:00Z");
  const base = { nextReviewAt: new Date("2026-06-10T00:00:00Z"), intervalDays: 10, ease: 2.5, repetitions: 5, ayahCount: 5, lastQuality: 5 };
  it("gives its reasons", () => {
    expect(revisionPlan({ ...base, nextReviewAt: new Date("2026-06-05T00:00:00Z"), lastQuality: 2, difficulty: 5 }, now).reasons).toEqual(["overdue", "recent_failure", "teacher_difficulty"]);
  });
  it("weighs lateness against the segment's own interval", () => {
    const late = new Date("2026-06-07T00:00:00Z");
    expect(revisionPlan({ ...base, nextReviewAt: late, intervalDays: 2 }, now).score).toBeGreaterThan(revisionPlan({ ...base, nextReviewAt: late, intervalDays: 60 }, now).score);
  });
  it("raises a segment the teacher rated hard and lowers an easy one", () => {
    const score = (difficulty: number | null) => revisionPlan({ ...base, difficulty }, now).score;
    expect(score(5)).toBeGreaterThan(score(null));
    expect(score(1)).toBeLessThan(score(null));
  });
  it("suggests difficulty from results", () => {
    expect(suggestDifficulty(1.5, 0)).toBe(5);
    expect(suggestDifficulty(2.5, 3)).toBe(5);
    expect(suggestDifficulty(2.8, 0)).toBe(1);
  });
  it("compares teacher-approved ayahs with the plan's pace", () => {
    const rows = [{ juz: 30, page: 604, at: new Date("2026-06-09") }, { juz: 30, page: 604, at: new Date("2026-05-01") }];
    const plan = { newAyahsPerDay: 3, studyDays: [0, 1, 2, 3, 4, 5, 6], startDate: new Date("2026-01-01") };
    const r = actualMemorization(rows, plan, new Date("2026-06-08T00:00:00Z"), now);
    expect(r).toEqual({ totalAyahs: 2, pages: 1, juzTouched: 1, inPeriod: 1, planned: 9 });
    expect(actualMemorization(rows, null, new Date("2026-06-08T00:00:00Z"), now).planned).toBeNull();
  });
});

describe("hadith final exam parts", () => {
  it("splits at a word boundary and loses no text", () => {
    const p = completionParts("أ ب ت ث ج ح خ د");
    expect(`${p.shown} ${p.expected}`).toBe("أ ب ت ث ج ح خ د");
    expect(p.expected.split(" ")).toHaveLength(5);
    expect(completionParts("كلمتان فقط").shown).toBe("كلمتان");
  });
});

describe("Quran quotations inside adhkar", () => {
  const data = JSON.parse(readFileSync("data/quran/raw/quran-uthmani.json", "utf8")) as { data: { surahs: { number: number; ayahs: { numberInSurah: number; text: string }[] }[] } };
  const ayahs = data.data.surahs.flatMap((s) => s.ayahs.map((a) => ({ surahId: s.number, ayahNumber: a.numberInSurah, searchText: skeleton(a.text), text: a.text })));
  const index = buildQuoteIndex(ayahs);
  const kursi = ayahs.find((a) => a.surahId === 2 && a.ayahNumber === 255)!;
  it("finds a full ayah quoted in stored text", () => {
    const m = findQuotes(`قبله نص ${kursi.text} وبعده نص`, index).find((x) => x.surahId === 2 && x.ayahNumber === 255);
    expect(m?.kind).toBe("FULL_AYAH");
  });
  it("reports a partial quotation as partial", () => {
    const m = findQuotes(kursi.text.split(" ").slice(0, 8).join(" "), index).find((x) => x.surahId === 2 && x.ayahNumber === 255);
    expect(m?.kind).toBe("PARTIAL");
  });
  it("ignores text with no five-word run", () => {
    expect(findQuotes("هذا نص عادي لا يتضمن شيئا من ذلك أبدا", index)).toEqual([]);
  });
});
