import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.js";
import { createHwpxDocument, fillHwpTemplate, replaceHwpText } from "../src/tools/write.js";
import { appendHwpParagraph, setHwpCellText, setHwpParagraphText } from "../src/tools/edit.js";
import { readHwpText, readHwpTables } from "../src/tools/read.js";

const pua = "\uF53A\u302E";
const unicode = "\u1112\u119E\u11AB\u302E";
const sentinel = "\uE000\uF86A \uA960\uD7B0\uD7CB\u302F \u115F\u1160 😀";
let dir: string;
let sequence = 0;
const output = () => join(dir, `${sequence++}.hwpx`);
const run = (text: string) => `<hp:run charPrIDRef="0"><hp:t>${text}</hp:t></hp:run>`;
const cell = (row: number, text: string) => '<hp:tc><hp:subList textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP">' +
  `<hp:p id="${101 + row}" paraPrIDRef="0" styleIDRef="0">${text}</hp:p></hp:subList>` +
  `<hp:cellAddr colAddr="0" rowAddr="${row}"/><hp:cellSpan colSpan="1" rowSpan="1"/>` +
  '<hp:cellSz width="10000" height="2000"/></hp:tc>';
const table = '<hp:tbl id="100" rowCnt="2" colCnt="1">' +
  `<hp:tr>${cell(0, run("표 제목"))}</hp:tr>` +
  `<hp:tr>${cell(1, run(pua) + run("남으면 안 됨"))}</hp:tr></hp:tbl>`;

beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "hwp-old-edit-")); });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function fixture(textXml: string, extra = "", nestedTable = false): Promise<string> {
  const zip = await JSZip.loadAsync(readFileSync("test/fixtures/text_only.hwpx"));
  let xml = await zip.file("Contents/section0.xml")!.async("string");
  xml = xml.replace("<hp:t>hwpx 텍스트.</hp:t>", textXml + (nestedTable ? table : ""));
  xml = xml.replace("</hs:sec>", `${extra}</hs:sec>`);
  zip.file("Contents/section0.xml", xml);
  zip.file("BinData/audit.bin", Buffer.from([0, 255, 1, 127]));
  const path = output();
  writeFileSync(path, await zip.generateAsync({ type: "uint8array" }));
  return path;
}

async function section(path: string): Promise<string> {
  const zip = await JSZip.loadAsync(readFileSync(path));
  return zip.file("Contents/section0.xml")!.async("string");
}

describe("old Hangul HWPX edit/save/reopen", () => {
  it("creates and appends exact PUA, jamo, tone marks, fillers and emoji", async () => {
    const original = output(), appended = output();
    const text = `${pua} ${unicode} ${sentinel}`;
    expect(await createHwpxDocument({ output_path: original, content: JSON.stringify([{ type: "text", text }]) })).toContain("created");
    const before = readFileSync(original);
    expect(await readHwpText({ file_path: original })).toContain(text);
    expect(await appendHwpParagraph({ file_path: original, output_path: appended, text: `추가 ${text}` })).toContain("appended");
    expect(await readHwpText({ file_path: appended })).toContain(`추가 ${text}`);
    expect(readFileSync(original)).toEqual(before);
  });

  it("replaces every occurrence in one node without altering unrelated ZIP entries or source", async () => {
    const file_path = await fixture(`<hp:t>${pua} / ${pua} / ${sentinel}</hp:t>`);
    const before = readFileSync(file_path), output_path = output();
    const result = await replaceHwpText({ file_path, output_path, old_text: pua, new_text: unicode });
    expect(result).toContain("replaced 2");
    expect(await readHwpText({ file_path: output_path })).toContain(`${unicode} / ${unicode} / ${sentinel}`);
    expect(readFileSync(file_path)).toEqual(before);
    const inputZip = await JSZip.loadAsync(before), outputZip = await JSZip.loadAsync(readFileSync(output_path));
    expect(Object.keys(outputZip.files).sort()).toEqual(Object.keys(inputZip.files).sort());
    for (const [name, entry] of Object.entries(inputZip.files)) {
      if (entry.dir || name === "Contents/section0.xml") continue;
      expect(await outputZip.file(name)!.async("uint8array"), name).toEqual(await entry.async("uint8array"));
    }
  });

  it("matches XML decimal/hex references and leaves other encoded text unchanged", async () => {
    const file_path = await fixture(`<hp:t>&#xF53A;&#12334; / ${sentinel} / &#xE1A7;</hp:t>`);
    const output_path = output();
    expect(await replaceHwpText({ file_path, output_path, old_text: pua, new_text: unicode })).toContain("replaced 1");
    expect(await readHwpText({ file_path: output_path })).toContain(`${unicode} / ${sentinel} / \uE1A7`);
    expect(await section(output_path)).toContain("&#xE1A7;");
  });

  it("uses opt-in Unicode matching for legacy PUA and already-Unicode old Hangul", async () => {
    const file_path = await fixture(`<hp:t>${pua} / ${unicode} / ${sentinel}</hp:t>`);
    const output_path = output();
    const result = await replaceHwpText({ file_path, output_path, old_text: unicode, new_text: "교정 \u1100\u119E\u302F", old_hangul: "unicode" } as any);
    expect(result).toContain("replaced 2");
    expect(await readHwpText({ file_path: output_path })).toContain(`교정 \u1100\u119E\u302F / 교정 \u1100\u119E\u302F / ${sentinel}`);
  });

  it("defaults to literal encoding and never silently modernizes the whole document", async () => {
    const file_path = await fixture(`<hp:t>${pua} / ${unicode}</hp:t>`);
    const output_path = output();
    expect(await replaceHwpText({ file_path, output_path, old_text: unicode, new_text: "수정" })).toContain("replaced 1");
    expect(await readHwpText({ file_path: output_path })).toContain(`${pua} / 수정`);
  });

  it("matches a jamo sequence split across adjacent text runs and preserves run tags", async () => {
    const file_path = await fixture(`<hp:t>앞 \u1112</hp:t></hp:run>${run("\u119E")}` +
      `<hp:run charPrIDRef="0"><hp:t>\u11AB\u302E 뒤 ${sentinel}</hp:t>`);
    const output_path = output();
    const before = await section(file_path);
    expect(await replaceHwpText({ file_path, output_path, old_text: unicode, new_text: pua })).toContain("replaced 1");
    expect(await readHwpText({ file_path: output_path })).toContain(`앞 ${pua} 뒤 ${sentinel}`);
    expect((await section(output_path)).match(/<hp:run\b/g)?.length).toBe(before.match(/<hp:run\b/g)?.length);
  });

  it("does not match part of a PUA expansion or join text across paragraphs/controls", async () => {
    const file_path = await fixture(`<hp:t>${pua} 앞</hp:t>`,
      `<hp:p id="200" paraPrIDRef="0" styleIDRef="0">${run("뒤")}</hp:p>`);
    for (const old_text of ["\u119E", "앞뒤"]) {
      const output_path = output();
      expect(await replaceHwpText({ file_path, output_path, old_text, new_text: "삭제", old_hangul: "unicode" } as any)).toContain("replaced 0");
      expect(await section(output_path)).toBe(await section(file_path));
    }
    const controlFile = await fixture("<hp:t>앞<hp:tab/>뒤</hp:t>");
    expect(await replaceHwpText({ file_path: controlFile, output_path: output(), old_text: "앞뒤", new_text: "삭제" })).toContain("replaced 0");
  });

  it("matches named XML entities and treats replacement dollars and XML delimiters literally", async () => {
    const file_path = await fixture("<hp:t>A &amp; B &lt; C / &amp;#xF53A;</hp:t>");
    const output_path = output();
    expect(await replaceHwpText({ file_path, output_path, old_text: "A & B < C", new_text: `${unicode} & < > $& $1` })).toContain("replaced 1");
    expect(await section(output_path)).toContain(`${unicode} &amp; &lt; &gt; $&amp; $1`);
    expect(await section(output_path)).toContain("&amp;#xF53A;");
  });

  it("fills old Hangul template keys and values using the same matching option", async () => {
    const file_path = await fixture(`<hp:t>${pua} {{옛글}} / ${sentinel}</hp:t>`);
    const output_path = output();
    expect(await fillHwpTemplate({ file_path, output_path, old_hangul: "unicode", replacements: JSON.stringify({ [unicode]: "제목", "{{옛글}}": unicode }) } as any)).toContain("2 replacements");
    expect(await readHwpText({ file_path: output_path })).toContain(`제목 ${unicode} / ${sentinel}`);
  });

  it("sets paragraph text without deleting page settings or nested table text", async () => {
    const file_path = await fixture(`<hp:t>${pua}</hp:t>`, "", true);
    const output_path = output(), before = await section(file_path);
    expect(await setHwpParagraphText({ file_path, output_path, index: 0, text: `교정 ${unicode}` })).toContain("paragraph text set");
    const after = await section(output_path);
    expect(after).toContain(before.match(/<hp:secPr\b[\s\S]*?<\/hp:secPr>/)![0]);
    expect(after).toContain(table);
    expect(await readHwpText({ file_path: output_path })).toContain(`교정 ${unicode}`);
    expect(await readHwpTables({ file_path: output_path })).toContain(pua);
  });

  it("sets a multi-run table cell without leaving old text or changing other cells", async () => {
    const file_path = await fixture(`<hp:t>본문 ${sentinel}</hp:t>`,
      `<hp:p id="100" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0">${table}</hp:run></hp:p>`);
    const output_path = output();
    expect(await setHwpCellText({ file_path, output_path, table_index: 0, row: 1, col: 0, text: `${unicode} $&` })).toContain("saved");
    const tables = await readHwpTables({ file_path: output_path });
    expect(tables).toContain(unicode);
    expect(await section(output_path)).toContain(`${unicode} $&amp;`);
    expect(tables).toContain("표 제목");
    expect(tables).not.toContain("남으면 안 됨");
    expect(tables).not.toContain(pua);
    expect(await readHwpText({ file_path: output_path })).toContain(sentinel);
  });

  it("rejects HWP editing without creating or altering a binary file", async () => {
    const file_path = "test/fixtures/simple.hwp", before = readFileSync(file_path);
    const output_path = output().replace(/hwpx$/, "hwp");
    expect(await replaceHwpText({ file_path, output_path, old_text: pua, new_text: unicode })).toMatch(/지원하지|only/);
    expect(await setHwpParagraphText({ file_path, output_path, index: 0, text: unicode })).toMatch(/only/);
    expect(readFileSync(file_path)).toEqual(before);
    expect(existsSync(output_path)).toBe(false);
  });

  it("rejects an HWP extension for structured HWPX edit output", async () => {
    const file_path = await fixture(`<hp:t>${pua}</hp:t>`);
    const output_path = output().replace(/hwpx$/, "hwp");
    expect(await setHwpParagraphText({ file_path, output_path, index: 0, text: unicode })).toContain("cross-format");
    expect(existsSync(output_path)).toBe(false);
  });

  it("rejects empty searches, invalid modes and non-string template values before saving", async () => {
    const file_path = await fixture(`<hp:t>${pua}</hp:t>`);
    for (const args of [{ old_text: "" }, { old_hangul: "auto" }]) {
      const output_path = output();
      expect(await replaceHwpText({ file_path, output_path, old_text: pua, new_text: unicode, ...args } as any)).toMatch(/error|must|empty/i);
      expect(existsSync(output_path)).toBe(false);
    }
    const output_path = output();
    expect(await fillHwpTemplate({ file_path, output_path, replacements: '{"x":1}' })).toMatch(/error|must/i);
    expect(existsSync(output_path)).toBe(false);
  });

  it("supports Unicode old Hangul replacement through an actual MCP tool call", async () => {
    const file_path = await fixture("<hp:t>&#xF53A;&#x302E;</hp:t>"), output_path = output();
    const server = buildServer(), client = new Client({ name: "edit-audit", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const { tools } = await client.listTools();
      for (const name of ["replace_hwp_text", "fill_hwp_template"]) {
        expect(tools.find((t) => t.name === name)?.inputSchema.properties).toHaveProperty("old_hangul");
      }
      const result = await client.callTool({ name: "replace_hwp_text", arguments: {
        file_path, output_path, old_text: unicode, new_text: `수정 ${unicode}`, old_hangul: "unicode",
      } });
      expect((result.content as Array<{ text: string }>)[0].text).toContain("replaced 1");
      const reopened = await client.callTool({ name: "read_hwp_text", arguments: { file_path: output_path } });
      expect((reopened.content as Array<{ text: string }>)[0].text).toContain(`수정 ${unicode}`);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
