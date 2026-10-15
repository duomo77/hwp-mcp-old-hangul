import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HwpDocument } from "@rhwp/core";
import JSZip from "jszip";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.js";
import { initRhwp } from "../src/core/wasm-init.js";
import { readHwp, readHwpText, readHwpTables, readHwpOldHangul } from "../src/tools/read.js";
import { convertHwpMarkdown, flowToMarkdown } from "../src/tools/convert.js";

const raw = "현대 한글 \uE1A7 \uF53A \u1100\u119E\u302E \uA960\uD7B0\uD7CB\u302F \u115F\u1160 \uE000\uF86A 😀";
const decoded = "현대 한글 \u1100\u119E \u1112\u119E\u11AB \u1100\u119E\u302E \uA960\uD7B0\uD7CB\u302F \u115F\u1160 \uE000\uF86A 😀";
let dir: string;

beforeAll(async () => {
  await initRhwp();
  dir = mkdtempSync(join(tmpdir(), "hwp-old-hangul-"));
  const doc = HwpDocument.createEmpty();
  try {
    doc.createBlankDocument();
    doc.insertText(0, 0, 0, raw);
    // HWPX export in rhwp 0.7.x does not round-trip all controls; export the
    // body-only HWPX before creating controls. HWP covers the nested text.
    const zip = await JSZip.loadAsync(doc.exportHwpx());
    const xml = await zip.file("Contents/section0.xml")!.async("string");
    const splitAt = raw.indexOf("\u1100") + 1;
    const refs = (s: string) => [...s].map((c) => c.codePointAt(0)! < 0x80 ? c : `&#x${c.codePointAt(0)!.toString(16)};`).join("");
    // Split a Unicode syllable across runs and encode characters as XML numeric
    // references to check that extraction reaches our decoder without loss.
    const splitText = `<hp:t>${refs(raw.slice(0, splitAt))}</hp:t></hp:run>` +
      `<hp:run charPrIDRef="0"><hp:t>${refs(raw.slice(splitAt))}</hp:t>`;
    const splitXml = xml.replace(`<hp:t>${raw}</hp:t>`, splitText);
    if (splitXml === xml) throw new Error("HWPX fixture text was not replaced");
    const cell = (row: number, text: string) => '<hp:tc>' +
      '<hp:subList textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP">' +
      `<hp:p id="${101 + row}" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0">` +
      `<hp:t>${text}</hp:t></hp:run></hp:p></hp:subList>` +
      `<hp:cellAddr colAddr="0" rowAddr="${row}"/><hp:cellSpan colSpan="1" rowSpan="1"/>` +
      '<hp:cellSz width="10000" height="2000"/></hp:tc>';
    const tableXml = '<hp:p id="100" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0">' +
      '<hp:tbl id="100" rowCnt="2" colCnt="1">' +
      `<hp:tr>${cell(0, '표 &#xF53A;&#x302E;')}</hp:tr>` +
      `<hp:tr>${cell(1, '셀 &#xE1A7;')}</hp:tr>` +
      '</hp:tbl></hp:run></hp:p>';
    zip.file("Contents/section0.xml", splitXml.replace("</hs:sec>", `${tableXml}</hs:sec>`));
    writeFileSync(join(dir, "old.hwpx"), await zip.generateAsync({ type: "uint8array" }));
    const table = JSON.parse(doc.createTable(0, 0, doc.getParagraphLength(0, 0), 2, 1));
    doc.insertTextInCell(0, table.paraIdx, table.controlIdx, 0, 0, 0, "표 \uF53A\u302E");
    doc.insertTextInCell(0, table.paraIdx, table.controlIdx, 1, 0, 0, "셀 \uE1A7");
    doc.createHeaderFooter(0, true, 0);
    doc.insertTextInHeaderFooter(0, true, 0, 0, 0, "머리말 \uF53A");
    doc.createHeaderFooter(0, false, 0);
    doc.insertTextInHeaderFooter(0, false, 0, 0, 0, "꼬리말 \uE1A7");
    writeFileSync(join(dir, "old.hwp"), doc.exportHwp());
  } finally {
    doc.free();
  }
  const notes = HwpDocument.createEmpty();
  try {
    notes.createBlankDocument();
    notes.insertText(0, 0, 0, "각주가 있는 본문");
    const fn = JSON.parse(notes.insertFootnote(0, 0, notes.getParagraphLength(0, 0)));
    notes.insertTextInFootnote(0, fn.paraIdx, fn.controlIdx, 0, 0, "각주 \uF53A\u302F");
    writeFileSync(join(dir, "notes.hwp"), notes.exportHwp());
  } finally {
    notes.free();
  }
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe.each(["hwp", "hwpx"])("old Hangul in .%s", (ext) => {
  it("preserves original extraction by default and converts only on request", async () => {
    const file_path = join(dir, `old.${ext}`);
    const before = readFileSync(file_path);
    expect(await readHwpText({ file_path })).toContain(raw);
    expect(await readHwpText({ file_path, old_hangul: "unicode" })).toContain(decoded);
    expect(await readHwp({ file_path, old_hangul: "unicode" })).toContain(decoded);
    expect(await convertHwpMarkdown({ file_path, old_hangul: "unicode" })).toContain(decoded);
    expect(await convertHwpMarkdown({ file_path })).toContain(raw);
    expect(readFileSync(file_path)).toEqual(before);
  });

  it("returns Unicode text, optional original extraction and unknown-code diagnostics", async () => {
    const file_path = join(dir, `old.${ext}`);
    const result = JSON.parse(await readHwpOldHangul({ file_path, include_original: true }));
    expect(result.text).toContain(decoded);
    expect(result.original_text).toContain(raw);
    expect(result.analysis.mapped_pua_count).toBeGreaterThanOrEqual(2);
    expect(result.analysis.unmapped_pua).toContainEqual({ codepoint: "U+F86A", count: 1 });
    expect(result.analysis.tone_mark_count).toBeGreaterThanOrEqual(2);
    expect(JSON.parse(await readHwpOldHangul({ file_path }))).not.toHaveProperty("original_text");
  });

  it("writes UTF-8 Markdown with exact jamo and tone marks", async () => {
    const output_path = join(dir, `converted-${ext}.md`);
    await convertHwpMarkdown({ file_path: join(dir, `old.${ext}`), output_path, old_hangul: "unicode" });
    expect(readFileSync(output_path, "utf8")).toContain(decoded);
  });

  it("converts table cells in the combined, table-only and diagnostic readers", async () => {
    const file_path = join(dir, `old.${ext}`);
    expect(await readHwpTables({ file_path, old_hangul: "unicode" })).toContain("셀 \u1100\u119E");
    expect(await readHwp({ file_path, old_hangul: "unicode" })).toContain("표 \u1112\u119E\u11AB\u302E");
    expect(JSON.parse(await readHwpOldHangul({ file_path })).text).toContain("셀 \u1100\u119E");
  });
});

it("converts HWP table, header and footer text", async () => {
  const file_path = join(dir, "old.hwp");
  const tables = await readHwpTables({ file_path, old_hangul: "unicode" });
  expect(tables).toContain("표 \u1112\u119E\u11AB\u302E");
  expect(tables).toContain("셀 \u1100\u119E");
  expect(await readHwpTables({ file_path })).toContain("표 \uF53A");
  const body = await readHwpText({ file_path, old_hangul: "unicode" });
  expect(body).toContain("머리말 \u1112\u119E\u11AB");
  expect(body).toContain("꼬리말 \u1100\u119E");
  expect(await readHwp({ file_path, old_hangul: "unicode" })).toContain("셀 \u1100\u119E");
  const md = await convertHwpMarkdown({ file_path, old_hangul: "unicode" });
  expect(md).toContain("표 \u1112\u119E\u11AB\u302E");
});

it("converts HWP footnotes in text, diagnostics and Markdown", async () => {
  const file_path = join(dir, "notes.hwp");
  const expected = "각주 \u1112\u119E\u11AB\u302F";
  expect(await readHwpText({ file_path, old_hangul: "unicode" })).toContain(expected);
  expect(JSON.parse(await readHwpOldHangul({ file_path })).text).toContain(expected);
  expect(await convertHwpMarkdown({ file_path, old_hangul: "unicode" })).toContain(expected);
});

it("converts document content without changing image destinations", () => {
  const md = flowToMarkdown([
    { kind: "para", text: "\uF53A", headingLevel: 1 },
    { kind: "table", table: { rows: 1, cols: 1, cells: [["\uE1A7"]] } },
    { kind: "equation", script: "\uF53A" },
    { kind: "image", ref: { section: 0, paragraph: 0, controlIdx: 0, mime: "image/png", byteLength: 1, ext: "png" } },
  ], [{ section: 0, paragraph: 0, controlIdx: 1, number: 1, text: "\uF53A\u302E" }], {
    old_hangul: "unicode", imageRenderer: () => "![image](\uF53A/img.png)",
  });
  expect(md).toContain("# \u1112\u119E\u11AB");
  expect(md).toContain("| \u1100\u119E |");
  expect(md).toContain("$\u1112\u119E\u11AB$");
  expect(md).toContain("[^1]: \u1112\u119E\u11AB\u302E");
  expect(md).toContain("![image](\uF53A/img.png)");
});

it("returns existing error messages and rejects invalid options", async () => {
  expect(await readHwpOldHangul({ file_path: "/missing.hwp" })).toMatch(/not found/);
  expect(await readHwpOldHangul({ file_path: join(dir, "old.hwp"), include_original: "yes" as any })).toMatch(/boolean/);
  for (const tool of [readHwp, readHwpText, readHwpTables, convertHwpMarkdown]) {
    expect(await tool({ file_path: join(dir, "old.hwp"), old_hangul: "auto" as any })).toMatch(/old_hangul must/);
  }
});

it("exposes old Hangul tools and invokes them through MCP", async () => {
  const server = buildServer();
  const client = new Client({ name: "old-hangul-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const { tools } = await client.listTools();
    expect(tools.find((t) => t.name === "read_hwp_old_hangul")).toBeDefined();
    for (const name of ["read_hwp", "read_hwp_text", "read_hwp_tables", "convert_hwp_markdown"]) {
      expect(tools.find((t) => t.name === name)?.inputSchema.properties).toHaveProperty("old_hangul");
    }
    const result = await client.callTool({
      name: "read_hwp_old_hangul",
      arguments: { file_path: join(dir, "old.hwp"), include_original: true },
    });
    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const payload = JSON.parse(content[0].text);
    expect(payload.text).toContain(decoded);
    expect(payload.original_text).toContain(raw);
    const textResult = await client.callTool({
      name: "read_hwp_text",
      arguments: { file_path: join(dir, "old.hwpx"), old_hangul: "unicode" },
    });
    expect((textResult.content as Array<{ text: string }>)[0].text).toContain(decoded);
  } finally {
    await client.close();
    await server.close();
  }
});
