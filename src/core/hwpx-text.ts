import { decodeOldHangul, getOldHangulMode, type OldHangulMode } from "./old-hangul.js";

// A lexical scanner, not an XML serializer: unedited bytes, attributes, styles
// and entities keep their exact spelling. Input must be well-formed OWPML.
const XML_TOKENS = /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(?:[^"'<>]|"[^"]*"|'[^']*')*>|[^<]+/g;
const ENTITIES = /&(?:#x[\da-fA-F]+|#\d+|amp|lt|gt|quot|apos);|[\s\S]/gu;

interface Patch { start: number; end: number; text: string }
interface Atom { start: number; end: number; text: string }

export function escapeXmlText(text: string): string {
  // Reject invalid XML 1.0 characters, including unpaired UTF-16 surrogates.
  for (const ch of text) {
    if (!validXmlCodepoint(ch.codePointAt(0)!)) throw new Error("Text contains an invalid XML character");
  }
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\r/g, "&#13;");
}

function validXmlCodepoint(cp: number): boolean {
  return cp === 9 || cp === 10 || cp === 13 || (cp >= 0x20 && cp <= 0xd7ff) ||
    (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff);
}

function decodeEntity(raw: string): string {
  const named: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
  if (named[raw] !== undefined) return named[raw];
  if (!raw.startsWith("&#")) return raw;
  const hex = raw[2] === "x";
  const cp = parseInt(raw.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
  return validXmlCodepoint(cp) ? String.fromCodePoint(cp) : raw;
}

function patchXml(xml: string, patches: Patch[]): string {
  patches.sort((a, b) => a.start - b.start);
  const pieces: string[] = [];
  let cursor = 0;
  for (const p of patches) {
    pieces.push(xml.slice(cursor, p.start), p.text);
    cursor = p.end;
  }
  pieces.push(xml.slice(cursor));
  return pieces.join("");
}

/**
 * Match visible text across adjacent runs of one paragraph, but never across
 * controls, cells, paragraphs, comments or CDATA. Only complete source atoms
 * can match: a single PUA code cannot be partially overwritten by one jamo.
 */
export function replaceHwpxXmlText(
  xml: string, search: string, replacement: string, mode?: OldHangulMode
): { xml: string; count: number } {
  const encoding = getOldHangulMode(mode);
  if (typeof search !== "string" || search.length === 0) throw new Error("Search text must not be empty");
  if (typeof replacement !== "string") throw new Error("Replacement must be a string");
  const needle = decodeOldHangul(search, encoding), inserted = escapeXmlText(replacement);
  const patches: Patch[] = [];
  let atoms: Atom[] = [], inText = false, count = 0;
  function flush() {
    if (atoms.length === 0) return;
    const boundaries = new Map<number, number>();
    const parts: string[] = [];
    let length = 0;
    atoms.forEach((atom, index) => {
      boundaries.set(length, index);
      parts.push(atom.text);
      length += atom.text.length;
    });
    boundaries.set(length, atoms.length);
    const haystack = parts.join("");
    let cursor = 0, hit: number;
    while ((hit = haystack.indexOf(needle, cursor)) !== -1) {
      const first = boundaries.get(hit), end = boundaries.get(hit + needle.length);
      if (first === undefined || end === undefined) { cursor = hit + 1; continue; }
      for (let i = first; i < end; i++) {
        patches.push({ start: atoms[i].start, end: atoms[i].end, text: i === first ? inserted : "" });
      }
      count++;
      cursor = hit + needle.length;
    }
    atoms = [];
  }
  for (const token of xml.matchAll(XML_TOKENS)) {
    const raw = token[0], start = token.index!;
    if (!raw.startsWith("<")) {
      if (inText) {
        for (const atom of raw.matchAll(ENTITIES)) {
          atoms.push({ start: start + atom.index!, end: start + atom.index! + atom[0].length,
            text: decodeOldHangul(decodeEntity(atom[0]), encoding) });
        }
      } else if (raw.trim()) flush();
    } else if (/^<hp:t(?:\s|>|\/)/.test(raw)) {
      inText = !/\/\s*>$/.test(raw);
    } else if (/^<\/hp:t\s*>$/.test(raw)) {
      inText = false;
    } else if (/^<\/?hp:run(?:\s|>|\/)/.test(raw)) {
      // Adjacent runs can split a single old Hangul syllable.
    } else {
      flush();
    }
  }
  flush();
  return { xml: patches.length ? patchXml(xml, patches) : xml, count };
}

/** Balanced paragraph ranges; nested table paragraphs do not truncate parents. */
export function hwpxParagraphRanges(xml: string): Array<{ start: number; end: number }> {
  const stack: number[] = [], result: Array<{ start: number; end: number }> = [];
  for (const token of xml.matchAll(XML_TOKENS)) {
    if (/^<hp:p(?:\s|>)/.test(token[0])) stack.push(token.index!);
    else if (/^<\/hp:p\s*>$/.test(token[0])) {
      const start = stack.pop();
      if (start !== undefined) result.push({ start, end: token.index! + token[0].length });
    }
  }
  return result.sort((a, b) => a.start - b.start);
}

/** Set a paragraph's own text, preserving nested controls and their text. */
export function setHwpxParagraphXmlText(xml: string, text: string): string {
  const escaped = escapeXmlText(text), patches: Patch[] = [];
  let paragraphDepth = 0, textStart: number | undefined, textEnd = 0, first = true;
  for (const token of xml.matchAll(XML_TOKENS)) {
    const raw = token[0], start = token.index!;
    if (/^<hp:p(?:\s|>)/.test(raw)) paragraphDepth++;
    else if (/^<\/hp:p\s*>$/.test(raw)) {
      if (paragraphDepth === 1) textEnd = start;
      paragraphDepth--;
    } else if (paragraphDepth === 1 && /^<hp:t(?:\s|>|\/)/.test(raw)) {
      if (/\/\s*>$/.test(raw)) {
        patches.push({ start, end: start + raw.length, text: raw.replace(/\/\s*>$/, () => `>${first ? escaped : ""}</hp:t>`) });
        first = false;
      } else textStart = start + raw.length;
    } else if (paragraphDepth === 1 && /^<\/hp:t\s*>$/.test(raw) && textStart !== undefined) {
      // Nested inline controls in hp:t require an explicit structural edit.
      const content = xml.slice(textStart, start);
      if (content.includes("<")) throw new Error("Paragraph text contains inline XML controls; use replace_hwp_text instead");
      patches.push({ start: textStart, end: start, text: first ? escaped : "" });
      first = false;
      textStart = undefined;
    }
  }
  if (first) patches.push({ start: textEnd, end: textEnd, text: `<hp:run charPrIDRef="0"><hp:t>${escaped}</hp:t></hp:run>` });
  return patchXml(xml, patches);
}
