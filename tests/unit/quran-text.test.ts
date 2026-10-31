import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildAudioUrl } from "@/modules/quran/adapters";
import { alignTajweed, applySpans, separateBismillah, sha256, skeleton } from "@/modules/quran/text";

describe("separateBismillah", () => {
  const bism = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";
  it("removes only the four heading words from the first ayah", () => {
    expect(separateBismillah(2, 1, `${bism} الٓمٓ`)).toBe("الٓمٓ");
  });
  it("handles the shaddah variant used in some surahs", () => {
    expect(separateBismillah(95, 1, "بِّسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ وَٱلتِّينِ")).toBe("وَٱلتِّينِ");
  });
  it("keeps it in Al-Fatiha, where it is ayah 1, and strips only the BOM", () => {
    expect(separateBismillah(1, 1, `﻿${bism}`)).toBe(bism);
  });
  it("leaves At-Tawbah and later ayahs untouched", () => {
    expect(separateBismillah(9, 1, "بَرَآءَةٌۭ مِّنَ")).toBe("بَرَآءَةٌۭ مِّنَ");
    expect(separateBismillah(2, 2, "ذَٰلِكَ ٱلْكِتَٰبُ")).toBe("ذَٰلِكَ ٱلْكِتَٰبُ");
  });
  it("refuses to guess when the expected heading is missing", () => {
    expect(() => separateBismillah(2, 1, "الٓمٓ")).toThrow();
  });
});

describe("skeleton", () => {
  it("makes unvocalized search match vocalized text", () => {
    expect(skeleton("ٱلرَّحْمَٰنِ")).toBe(skeleton("الرحمن"));
  });
});

describe("tajweed alignment", () => {
  it("colours canonical letters and never reproduces the source's encoding", () => {
    const text = "ذَٰلِكَ ٱلْكِتَٰبُ";
    const spans = alignTajweed(text, "ذ[n[َٲ]لِكَ [h:11[ٱ]لْكِتَ[n[ـٰ]بُ");
    expect(spans).not.toBeNull();
    const out = applySpans(text, spans!).map((s) => s.text).join("");
    expect(out).toBe(text);
    expect(out).not.toContain("ٲ");
  });
  it("returns null rather than colouring text that does not align", () => {
    expect(alignTajweed("بِسْمِ", "[h[ق]ُلْ")).toBeNull();
  });
  it("reproduces text exactly with spans applied", () => {
    expect(applySpans("abcdef", [[1, 3, "g"], [4, 5, "q"]])).toEqual([
      { text: "a", code: null }, { text: "bc", code: "g" }, { text: "d", code: null }, { text: "e", code: "q" }, { text: "f", code: null },
    ]);
  });
});

describe("integrity manifest", () => {
  const m = JSON.parse(readFileSync("data/quran/manifest.json", "utf8"));
  it("records the known Quran totals", () => {
    expect(m.counts).toEqual({ surahs: 114, ayahs: 6236, pages: 604, juz: 30, rub: 240, sajda: 15 });
  });
  it("hashes deterministically", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("buildAudioUrl", () => {
  it("zero pads surah and ayah", () => {
    expect(buildAudioUrl("https://x/{sss}{aaa}.mp3", 2, 5, 12)).toBe("https://x/002005.mp3");
    expect(buildAudioUrl("https://x/{n}.mp3", 2, 5, 12)).toBe("https://x/12.mp3");
  });
});
