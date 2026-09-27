/**
 * D3c: the text of a worker's data file, for the chapter prompts. Word via
 * mammoth, CSV as it is, Excel via exceljs (one CSV-style block per sheet).
 * PDFs and images are not read here: Claude reads them directly. Every result
 * is capped so one file can never crowd out a chapter prompt.
 */

import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { extensionOf } from "@/lib/files/policy";

/** Per file; the whole pause is capped again where the prompt is built. */
export const MAX_EXTRACTED_CHARS = 40_000;
export const MAX_EXTRACTED_TOTAL = 80_000;
/** Rows read from one sheet (a data sheet longer than this is summarised by its first rows). */
const MAX_SHEET_ROWS = 2_000;

export type DataFileKind = "text" | "document" | "image";

/** How a data file reaches Claude: as extracted text, or as the file itself (a PDF document or an image). */
export function dataFileKind(fileName: string): DataFileKind | null {
  switch (extensionOf(fileName)) {
    case "docx":
    case "xlsx":
    case "csv":
      return "text";
    case "pdf":
      return "document";
    case "png":
    case "jpg":
    case "jpeg":
      return "image";
    default:
      return null;
  }
}

/** Cuts text at a line end near `max`, saying how much was left out. */
export function capText(text: string, max = MAX_EXTRACTED_CHARS): string {
  const clean = text.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const end = cut.lastIndexOf("\n");
  const kept = end > max * 0.8 ? cut.slice(0, end) : cut;
  return `${kept}\n[… ${clean.length - kept.length} more characters not included]`;
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

async function xlsxText(bytes: Uint8Array): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  const blocks: string[] = [];
  workbook.eachSheet((sheet) => {
    const lines: string[] = [];
    let rows = 0;
    sheet.eachRow({ includeEmpty: false }, (row) => {
      rows++;
      if (rows > MAX_SHEET_ROWS) return;
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => cells.push(csvCell((cell.text ?? "").toString().trim())));
      while (cells.length && !cells[cells.length - 1]) cells.pop();
      if (cells.length) lines.push(cells.join(","));
    });
    if (lines.length) {
      const more = rows > MAX_SHEET_ROWS ? `\n[… ${rows - MAX_SHEET_ROWS} more rows not included]` : "";
      blocks.push(`Sheet "${sheet.name}" (${rows} rows):\n${lines.join("\n")}${more}`);
    }
  });
  return blocks.join("\n\n");
}

/** The text of a Word, Excel or CSV data file (capped), or null for a PDF or image. */
export async function extractDataText(fileName: string, bytes: Uint8Array): Promise<string | null> {
  const ext = extensionOf(fileName);
  let text: string;
  if (ext === "docx") text = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
  else if (ext === "xlsx") text = await xlsxText(bytes);
  else if (ext === "csv") text = new TextDecoder().decode(bytes).replace(/^﻿/, "");
  else return null;
  return capText(text);
}

/**
 * Roughly how many pages a PDF has (counts page objects; good enough to refuse
 * a file far over the API's 100-page limit). Null when the count cannot be read,
 * e.g. pages kept in compressed object streams.
 */
export function roughPdfPages(bytes: Uint8Array): number | null {
  const text = new TextDecoder("latin1").decode(bytes);
  const pages = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0;
  if (pages > 0) return pages;
  const count = /\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/.exec(text) ?? /\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages/.exec(text);
  return count ? Number(count[1]) : null;
}

/** Reads a stored file into memory (data files are at most 20 MB). */
export async function streamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
