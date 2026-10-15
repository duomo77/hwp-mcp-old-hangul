import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { expandUnicodeTextReferences, prepareHwpxUnicode } from "../src/core/hwpx-unicode.js";

describe("HWPX Unicode character references", () => {
  it("expands hexadecimal and decimal Unicode text without decoding markup", () => {
    expect(expandUnicodeTextReferences('<hp:t>&#xF53A;&#61754; &#x1100;&#4510;&#x302E; &#x1F600; &amp; &lt;</hp:t>'))
      .toBe('<hp:t>\uF53A\uF13A \u1100\u119E\u302E 😀 &amp; &lt;</hp:t>');
  });

  it("preserves attributes, comments, CDATA and processing instructions", () => {
    const xml = '<?p value="&#xF53A;"?><hp:t title="a > &#xF53A;">' +
      '<![CDATA[&#xF53A;]]><!-- &#xF53A; --></hp:t>';
    expect(expandUnicodeTextReferences(xml)).toBe(xml);
  });

  it("preserves ASCII delimiters, invalid XML scalars and malformed references", () => {
    const xml = '<t>&#38;&#x3C;&#x3E;&#xD800;&#xFFFF;&#x110000;&#-1;&#xnope;</t>';
    expect(expandUnicodeTextReferences(xml)).toBe(xml);
  });

  it("does not double-decode escaped entity text", () => {
    expect(expandUnicodeTextReferences('<t>&amp;#xF53A;</t>')).toBe('<t>&amp;#xF53A;</t>');
  });

  it("returns original ZIP bytes when there are no numeric references", async () => {
    const bytes = new Uint8Array(readFileSync("test/fixtures/text_only.hwpx"));
    expect(await prepareHwpxUnicode(bytes)).toBe(bytes);
  });

  it("only changes section text in the in-memory archive", async () => {
    const zip = new JSZip();
    zip.file("Contents/section0.xml", '<t>&#xF53A;</t>');
    zip.file("Contents/header.xml", '<font name="&#xF53A;"/>');
    zip.file("BinData/data.bin", new Uint8Array([0, 255, 128]));
    const out = await JSZip.loadAsync(await prepareHwpxUnicode(await zip.generateAsync({ type: "uint8array" })));
    expect(await out.file("Contents/section0.xml")!.async("string")).toBe('<t>\uF53A</t>');
    expect(await out.file("Contents/header.xml")!.async("string")).toBe('<font name="&#xF53A;"/>');
    expect(await out.file("BinData/data.bin")!.async("uint8array")).toEqual(new Uint8Array([0, 255, 128]));
  });
});
