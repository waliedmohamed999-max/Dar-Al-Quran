import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { alignRecitation, reciteKey, wordsMatch } from "@/modules/quran/recite-match";

const quran = JSON.parse(readFileSync("data/quran/raw/quran-uthmani.json", "utf8")) as { data: { surahs: { number: number; ayahs: { numberInSurah: number; text: string }[] }[] } };
const ayah = (s: number, a: number) => quran.data.surahs[s - 1].ayahs[a - 1].text.trim().split(/\s+/);

describe("matching recognized speech to the stored text", () => {
  it("accepts common spelling of Uthmani words", () => {
    const fatiha = ayah(1, 2);
    expect(alignRecitation(fatiha, "الحمد لله رب العالمين").correct).toBe(fatiha.length);
    const fatiha3 = ayah(1, 3);
    expect(alignRecitation(fatiha3, "الرحمن الرحيم").correct).toBe(fatiha3.length);
    const fatiha4 = ayah(1, 4);
    expect(alignRecitation(fatiha4, "مالك يوم الدين").correct).toBe(fatiha4.length);
  });
  it("reveals nothing for unrelated speech", () => {
    const r = alignRecitation(ayah(112, 1), "اليوم الطقس جميل جدا");
    expect(r.correct).toBe(0);
    expect(r.cursor).toBe(0);
  });
  it("reveals only up to where the reciter stopped", () => {
    const words = ayah(1, 2);
    const r = alignRecitation(words, "الحمد لله");
    expect(r.states.slice(0, 2)).toEqual(["correct", "correct"]);
    expect(r.states.slice(2)).toEqual(["hidden", "hidden"]);
  });
  it("needs two words in a row to jump, then marks the skipped words", () => {
    const words = ayah(1, 2);
    expect(alignRecitation(words, "رب").cursor).toBe(0);
    const r = alignRecitation(words, "رب العالمين");
    expect(r.states).toEqual(["missed", "missed", "correct", "correct"]);
  });
  it("does not advance on a wrong word, and continues when corrected", () => {
    const words = ayah(1, 2);
    const r = alignRecitation(words, "الحمد كتاب لله");
    expect(r.correct).toBe(2);
  });
  it("gives the same result when re-run with a revised transcript", () => {
    const words = ayah(1, 2);
    expect(alignRecitation(words, "الحمد لله").cursor).toBe(2);
    expect(alignRecitation(words, "الحمد لله رب").cursor).toBe(3);
  });
  it("tolerates one slip in long words only", () => {
    expect(wordsMatch("العالمبن", "ٱلْعَـٰلَمِينَ")).toBe(true);
    expect(wordsMatch("قل", "قال")).toBe(true); // Same letters once long vowels are dropped: a known limit.
    expect(wordsMatch("من", "عن")).toBe(false);
  });
  it("ignores diacritics and Quranic marks", () => {
    expect(reciteKey("ٱلْحَمْدُ")).toBe(reciteKey("الحمد"));
  });
});
