import { describe, expect, it } from "vitest";
import { HANYANG_PUA } from "../src/core/data/hanyang-pua.js";
import { analyzeOldHangul, decodeOldHangul, getOldHangulMode } from "../src/core/old-hangul.js";

describe("Hanyang PUA decoding", () => {
  it("ships the full 5,660 nonempty KTUG mappings", () => {
    expect(Object.keys(HANYANG_PUA)).toHaveLength(5660);
    expect(HANYANG_PUA[0xe0bc]).toBe("\u115F\u1161\u11AE");
    expect(HANYANG_PUA[0xf8f7]).toBe("\u11F9");
    expect(HANYANG_PUA[0xf86a]).toBeUndefined();
  });

  it("expands araea, pansios, yesieung and kapyeoun pieup", () => {
    expect(decodeOldHangul("\uE1A7\uF53A\uF7D8\uF7FF\uF7C0", "unicode"))
      .toBe("\u1100\u119E\u1112\u119E\u11AB\u1140\u1159\u112B");
  });

  it("uses the corrected KTUG entries rather than trailing historical comments", () => {
    expect(decodeOldHangul("\uE230\uE231\uE232\uE95C\uF4C7", "unicode"))
      .toBe("\u1102\u117A\u1102\u117A\u11A8\u1102\u117A\u11C2\u1109\u1173\u11F2\u1112\u117C\u11F9");
  });

  it("preserves Unicode jamo, extended jamo, fillers and tone marks exactly", () => {
    const text = "\u1100\u119E\u302E \uA960\uD7B0\uD7CB\u302F \u115F\u1160 \u313F\u318D";
    expect(decodeOldHangul(text, "unicode")).toBe(text);
  });

  it("preserves unknown codes, the empty F86A entry, symbols and emoji", () => {
    const text = "\uE000\uF0A0\uF0E8\uF86A\uF8FF\u{F0000}\u{10FFFD} 😀 한글 漢字";
    expect(decodeOldHangul(text, "unicode")).toBe(text);
  });

  it("keeps existing output unchanged unless conversion is requested", () => {
    const text = "한글 \uF53A \u1100\u1161";
    expect(decodeOldHangul(text)).toBe(text);
    expect(decodeOldHangul(text, "preserve")).toBe(text);
  });

  it("is idempotent for the entire mapping repertoire", () => {
    const text = String.fromCodePoint(...Object.keys(HANYANG_PUA).map(Number));
    const once = decodeOldHangul(text, "unicode");
    expect(decodeOldHangul(once, "unicode")).toBe(once);
    expect(once).not.toMatch(/[\uE000-\uF8FF]/);
  });

  it("rejects unsupported modes instead of silently returning damaged output", () => {
    expect(getOldHangulMode(undefined)).toBe("preserve");
    for (const mode of [null, false, "NFKC", "auto"]) {
      expect(() => getOldHangulMode(mode)).toThrow(/old_hangul/);
    }
  });
});

describe("old Hangul diagnostics", () => {
  it("counts occurrences before conversion and reports unknown PUA by code point", () => {
    const info = analyzeOldHangul("\uF53A\uF53A \u1100\u119E \uA960\uD7B0\uD7CB \u302E\u302F \uE000\uE000\uF86A\u{F0000}😀");
    expect(info).toMatchObject({
      mapped_pua_count: 2, unicode_jamo_count: 5, tone_mark_count: 2,
      unmapped_pua_count: 4, unmapped_pua_list_truncated: false,
      unmapped_pua: [
        { codepoint: "U+E000", count: 2 },
        { codepoint: "U+F86A", count: 1 },
        { codepoint: "U+F0000", count: 1 },
      ],
    });
    expect(info.warnings).toHaveLength(2);
  });

  it("bounds diagnostic lists without losing total counts", () => {
    const info = analyzeOldHangul(String.fromCodePoint(...Array.from({ length: 40 }, (_, i) => 0xe000 + i)));
    expect(info.unmapped_pua_count).toBe(40);
    expect(info.unmapped_pua).toHaveLength(32);
    expect(info.unmapped_pua_list_truncated).toBe(true);
  });

  it("does not classify modern Hangul or emoji as private-use text", () => {
    const info = analyzeOldHangul("안녕하세요 漢字 😀");
    expect(info.mapped_pua_count + info.unmapped_pua_count + info.unicode_jamo_count).toBe(0);
    expect(info.warnings).toEqual([]);
  });
});
