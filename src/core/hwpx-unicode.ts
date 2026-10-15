import JSZip from "jszip";

/**
 * rhwp 0.7.x skips numeric character-reference events in HWPX text. Expand
 * non-ASCII XML character references in section text before handing it to WASM.
 * ASCII references remain encoded (in particular XML delimiters such as &/<).
 * Markup, attributes, comments and CDATA must retain their lexical meaning.
 */
export function expandUnicodeTextReferences(xml: string): string {
  return xml.replace(
    /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(?:[^"'<>]|"[^"]*"|'[^']*')*>|([^<]+)/g,
    (token: string, text: string | undefined) => {
      if (text === undefined) return token;
      return text.replace(/&#(?:x([0-9a-fA-F]+)|([0-9]+));/g, (ref, hex, decimal) => {
        const cp = parseInt(hex ?? decimal, hex === undefined ? 10 : 16);
        const valid = (cp >= 0x80 && cp <= 0xd7ff) ||
          (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff);
        return valid ? String.fromCodePoint(cp) : ref;
      });
    }
  );
}

/** Repackage only when needed, in memory; the source file is never written. */
export async function prepareHwpxUnicode(bytes: Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes);
  let changed = false;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !/^Contents\/section\d+\.xml$/i.test(entry.name)) continue;
    const xml = await entry.async("string");
    if (!xml.includes("&#")) continue;
    const expanded = expandUnicodeTextReferences(xml);
    if (expanded === xml) continue;
    zip.file(entry.name, expanded);
    changed = true;
  }
  return changed ? zip.generateAsync({ type: "uint8array" }) : bytes;
}
