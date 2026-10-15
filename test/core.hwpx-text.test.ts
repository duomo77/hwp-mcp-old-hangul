import { describe, expect, it } from "vitest";
import { escapeXmlText, replaceHwpxXmlText, setHwpxParagraphXmlText } from "../src/core/hwpx-text.js";

const wrap = (text: string) => `<hp:p id="1"><hp:run charPrIDRef="7"><hp:t>${text}</hp:t></hp:run></hp:p>`;

describe("lossless HWPX text search", () => {
  it("does not edit attributes, comments, CDATA, processing instructions or non-text elements", () => {
    const xml = '<!--\uF53A--><?audit \uF53A?><hp:script>\uF53A</hp:script>' +
      '<hp:p id="1" data="\uF53A"><hp:run charPrIDRef="7"><hp:t data="\uF53A">' +
      '<![CDATA[\uF53A]]>\uF53A</hp:t></hp:run></hp:p>';
    const result = replaceHwpxXmlText(xml, "\u1112\u119E\u11AB", "수정", "unicode");
    expect(result.count).toBe(1);
    expect(result.xml).toBe(xml.replace("]]>\uF53A", "]]>수정"));
  });

  it("matches non-BMP characters and never double-decodes entities", () => {
    const xml = wrap("&#x1F600;😀 &amp;#xF53A;");
    const result = replaceHwpxXmlText(xml, "😀", "\uF86A");
    expect(result.count).toBe(2);
    expect(result.xml).toBe(wrap("\uF86A\uF86A &amp;#xF53A;"));
    expect(replaceHwpxXmlText(xml, "\uF53A", "수정").count).toBe(0);
  });

  it("does not replace a self-containing value recursively or split a PUA expansion", () => {
    expect(replaceHwpxXmlText(wrap("가가"), "가", "가가")).toEqual({ xml: wrap("가가가가"), count: 2 });
    const xml = wrap("\uF53A \u119E");
    expect(replaceHwpxXmlText(xml, "\u119E", "수정", "unicode")).toEqual({ xml: wrap("\uF53A 수정"), count: 1 });
  });

  it("preserves unedited entity spellings, other fonts and empty runs", () => {
    const xml = '<hp:p id="1"><hp:run charPrIDRef="7"><hp:t>앞&#xF53A;</hp:t></hp:run>' +
      '<hp:run charPrIDRef="8"><hp:t/></hp:run>' +
      '<hp:run charPrIDRef="9"><hp:t>〮뒤&#xE1A7;</hp:t></hp:run></hp:p>';
    const result = replaceHwpxXmlText(xml, "ᄒᆞᆫ〮", "교정", "unicode");
    expect(result.count).toBe(1);
    expect(result.xml).toBe(xml.replace("&#xF53A;", "교정").replace("〮뒤", "뒤"));
  });

  it("sets empty paragraphs, handles literal dollar text and retains controls", () => {
    const xml = '<hp:p id="1"><hp:run charPrIDRef="7"><hp:secPr/><hp:t/></hp:run></hp:p>';
    expect(setHwpxParagraphXmlText(xml, "$& ᄒᆞᆫ〮")).toBe(xml.replace("<hp:t/>", () => "<hp:t>$&amp; ᄒᆞᆫ〮</hp:t>"));
    expect(setHwpxParagraphXmlText('<hp:p id="1"><hp:run charPrIDRef="7"><hp:secPr/></hp:run></hp:p>', "ᄒᆞᆫ〮"))
      .toContain('<hp:secPr/></hp:run><hp:run charPrIDRef="0"><hp:t>ᄒᆞᆫ〮</hp:t>');
  });

  it.each(["\u0000", "\u0001", "\uD800", "\uDFFF", "\uFFFE"])("rejects invalid XML text %j", (text) => {
    expect(() => escapeXmlText(text)).toThrow(/invalid XML/);
  });
});
