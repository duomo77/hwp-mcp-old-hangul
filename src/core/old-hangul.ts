import { HANYANG_PUA } from "./data/hanyang-pua.js";

export type OldHangulMode = "preserve" | "unicode";

/** An explicit encoding choice: PUA code points have no universal meaning. */
export function getOldHangulMode(mode: unknown): OldHangulMode {
  if (mode === undefined || mode === "preserve") return "preserve";
  if (mode === "unicode") return "unicode";
  throw new Error('old_hangul must be "preserve" or "unicode"');
}

/** Expand only known Hanyang codes. Never normalize, modernize or drop text. */
export function decodeOldHangul(text: string, mode?: OldHangulMode): string {
  if (getOldHangulMode(mode) === "preserve") return text;
  return text.replace(/[\uE0BC-\uF8F7]/g, (ch) => HANYANG_PUA[ch.charCodeAt(0)] ?? ch);
}

function isPrivateUse(cp: number): boolean {
  return (cp >= 0xe000 && cp <= 0xf8ff) ||
    (cp >= 0xf0000 && cp <= 0xffffd) ||
    (cp >= 0x100000 && cp <= 0x10fffd);
}

export interface OldHangulAnalysis {
  mapped_pua_count: number;
  unicode_jamo_count: number;
  tone_mark_count: number;
  unmapped_pua_count: number;
  unmapped_pua: Array<{ codepoint: string; count: number }>;
  unmapped_pua_list_truncated: boolean;
  warnings: string[];
}

/** Counts describe extracted text, not the document's original binary encoding. */
export function analyzeOldHangul(text: string): OldHangulAnalysis {
  let mapped = 0, jamo = 0, tones = 0, unmapped = 0;
  const unknown = new Map<number, number>();
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (HANYANG_PUA[cp] !== undefined) {
      mapped++;
    } else if (isPrivateUse(cp)) {
      unmapped++;
      unknown.set(cp, (unknown.get(cp) ?? 0) + 1);
    }
    if ((cp >= 0x1100 && cp <= 0x11ff) ||
        (cp >= 0xa960 && cp <= 0xa97c) ||
        (cp >= 0xd7b0 && cp <= 0xd7c6) ||
        (cp >= 0xd7cb && cp <= 0xd7fb)) jamo++;
    if (cp === 0x302e || cp === 0x302f) tones++;
  }
  const warnings: string[] = [];
  if (mapped > 0) warnings.push(
    "PUA 문자를 한양 PUA로 가정하여 변환했습니다. 다른 전용 글꼴의 문자라면 preserve 모드로 원문을 확인하세요. (Assumes Hanyang PUA encoding.)"
  );
  if (unmapped > 0) warnings.push(
    "매핑이 없는 PUA 문자는 그대로 보존했습니다. 원본 글꼴 또는 별도 매핑이 필요할 수 있습니다. (Unmapped private-use characters preserved.)"
  );
  return {
    mapped_pua_count: mapped,
    unicode_jamo_count: jamo,
    tone_mark_count: tones,
    unmapped_pua_count: unmapped,
    unmapped_pua: [...unknown].slice(0, 32).map(([cp, count]) => ({
      codepoint: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`, count,
    })),
    unmapped_pua_list_truncated: unknown.size > 32,
    warnings,
  };
}
