/**
 * Chapter review: the Word reader (src/lib/assembly/read-chapter-docx.ts) and
 * its equation half (omml-to-linear.ts). No database, no Claude, no Word.
 *
 *   npm run check:chapterdocx
 *
 * 1. Round trip: every fixture chapter is built as its own Word file, read back,
 *    built again from what was read and read again. The second reading must
 *    equal the first (the reader and the builder agree), the two files must say
 *    the same thing paragraph by paragraph, and every equation must survive.
 * 2. Equations: Word's equation XML back to text that parses to the same structure.
 * 3. What a specialist does in Word, one change per case (made with JSZip on a
 *    built chapter): translated style ids, tracked changes, split runs, comments,
 *    footnotes, pictures (PNG kept; EMF, charts, groups refused), text boxes,
 *    caption fields, Word lists and numbered headings, equations typed outside a
 *    table, deleted paragraph marks, markup typed as text, bold, sub- and
 *    superscripts, a fourth heading level, a table of contents, the wrong file.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";
import { buildReportDocument, packChapter, packReport, type AssemblyInput } from "../src/lib/assembly/assemble";
import { defaultParagraphStyle } from "../src/lib/assembly/finalize-docx";
import { linearText, parseEquation, toOmml } from "../src/lib/assembly/equation-omml";
import { ommlToLinear } from "../src/lib/assembly/omml-to-linear";
import { IMAGE_LINE, parseChapter } from "../src/lib/assembly/parse-chapter";
import { readChapterDocx, READER_VERSION, type ReadChapterResult } from "../src/lib/assembly/read-chapter-docx";
import { Packer } from "docx";
import { assemblyInput } from "./fixtures/assembly-fixture";
import { fixtureChapters, FIXTURE_REFERENCES, FIXTURE_TITLE } from "./fixtures/quality-fixture";
import { E_REFERENCES, E_THEMATIC, E_TITLE, endnotesChapters } from "./fixtures/endnotes-fixture";

const failures: string[] = [];
let passed = 0;
function check(label: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const eq = (label: string, got: unknown, want: unknown) => check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ─── Fixture inputs ──────────────────────────────────────────────────────────

function qualityInput(): AssemblyInput {
  const base = assemblyInput(false);
  return { ...base, title: FIXTURE_TITLE, chapters: fixtureChapters().map((c) => ({ number: c.number, text: c.text })), references: FIXTURE_REFERENCES };
}

function endnotesInput(): AssemblyInput {
  const base = assemblyInput(false);
  return {
    ...base,
    title: E_TITLE,
    department: "History",
    faculty: "Arts",
    mode: 1,
    section: "HUMANITIES",
    referencingStyle: "CHICAGO_NOTES_BIBLIOGRAPHY",
    citationPlacement: "MODE_B",
    thematicTitles: E_THEMATIC,
    chapters: endnotesChapters(),
    references: E_REFERENCES,
  };
}

const FIXTURES: { name: string; input: AssemblyInput }[] = [
  { name: "business", input: assemblyInput(false) },
  { name: "engineering", input: assemblyInput(true) },
  { name: "quality fixture", input: qualityInput() },
  { name: "endnotes fixture (MODE_B)", input: endnotesInput() },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const withChapter = (input: AssemblyInput, n: number, text: string): AssemblyInput => ({ ...input, chapters: input.chapters.map((c) => (c.number === n ? { ...c, text } : c)) });

async function read(buffer: Uint8Array, input: AssemblyInput, n: number): Promise<ReadChapterResult> {
  return readChapterDocx(buffer, { chapter: n, projectCode: input.projectCode, references: input.references });
}

/** The document paragraph by paragraph: style, text and how each run is set (italic, super-, subscript). */
async function signature(buffer: Uint8Array): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")!.async("string");
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const out: string[] = [];
  const paras = doc.getElementsByTagName("w:p");
  for (let i = 0; i < paras.length; i++) {
    const p = paras.item(i)!;
    const style = p.getElementsByTagName("w:pStyle").item(0)?.getAttribute("w:val") ?? "";
    let text = "";
    const runs = p.getElementsByTagName("w:r");
    for (let k = 0; k < runs.length; k++) {
      const r = runs.item(k)!;
      const t = [...Array(r.getElementsByTagName("w:t").length).keys()].map((j) => r.getElementsByTagName("w:t").item(j)!.textContent).join("");
      const va = r.getElementsByTagName("w:vertAlign").item(0)?.getAttribute("w:val");
      const it = r.getElementsByTagName("w:i").length > 0;
      text += va ? `<${va}>${t}</${va}>` : it ? `<i>${t}</i>` : t;
    }
    const math = p.getElementsByTagName("m:t");
    for (let k = 0; k < math.length; k++) text += `[m:${math.item(k)!.textContent}]`;
    if (text.trim() || style) out.push(`${style}|${text}`);
  }
  return out;
}

const equationsOf = (text: string, n: number) =>
  parseChapter(text, n)
    .blocks.filter((b): b is Extract<ReturnType<typeof parseChapter>["blocks"][number], { kind: "equation" }> => b.kind === "equation")
    .map((b) => linearText(parseEquation(b.text).nodes));

// ─── 1. Round trip ───────────────────────────────────────────────────────────

async function roundTrips() {
  for (const { name, input } of FIXTURES) {
    for (const ch of input.chapters) {
      const label = `${name} ch${ch.number}`;
      const { buffer: b1 } = await packChapter(input, ch.number, { sourceHash: "fixture" });
      const r1 = await read(b1, input, ch.number);
      eq(`${label}: nothing blocks the builder's own file`, r1.blocking, []);
      // The chapter file WPS opens: a real default paragraph style, double spaced and justified (30 Sept 2026).
      const normal = defaultParagraphStyle(await (await JSZip.loadAsync(b1)).file("word/styles.xml")!.async("string")) ?? "";
      check(`${label}: the chapter file has a default paragraph style, 2.0 and justified`, /w:line="480"/.test(normal) && /w:lineRule="auto"/.test(normal) && /<w:jc w:val="both"\/>/.test(normal), normal.slice(0, 80));
      const input2 = withChapter(input, ch.number, r1.markup);
      const { buffer: b2 } = await packChapter(input2, ch.number, { sourceHash: "fixture" });
      const r2 = await read(b2, input2, ch.number);
      check(`${label}: reading the rebuilt file gives the same text`, r1.markup === r2.markup, diffLine(r1.markup, r2.markup));
      eq(`${label}: the same hash`, r2.hash, r1.hash);
      const [s1, s2] = await Promise.all([signature(b1), signature(b2)]);
      check(`${label}: the rebuilt file says the same, paragraph by paragraph`, JSON.stringify(s1) === JSON.stringify(s2), firstDiff(s1, s2));
      eq(`${label}: every equation survives`, equationsOf(r1.markup, ch.number), equationsOf(ch.text, ch.number));
      const kinds = (t: string) => {
        const b = parseChapter(t, ch.number).blocks;
        return ["heading", "table", "figure", "equation"].map((k) => b.filter((x) => x.kind === k).length);
      };
      eq(`${label}: headings, tables, figures and equations kept`, kinds(r1.markup), kinds(ch.text));
    }
  }
  // The whole report built from read-back chapters says what the AI-text report says.
  for (const { name, input } of FIXTURES.slice(0, 2)) {
    const readBack = await Promise.all(
      input.chapters.map(async (c) => {
        const { buffer } = await packChapter(input, c.number, { sourceHash: "fixture" });
        return { number: c.number, text: (await read(buffer, input, c.number)).markup };
      }),
    );
    const [a, b] = await Promise.all([packReport(input), packReport({ ...input, chapters: readBack })]);
    const [sa, sb] = await Promise.all([signature(a.buffer), signature(b.buffer)]);
    check(`${name}: the report from approved (read-back) chapters matches the report from the AI text`, JSON.stringify(sa) === JSON.stringify(sb), firstDiff(sa, sb));
  }
}

function diffLine(a: string, b: string): string {
  const la = a.split("\n");
  const lb = b.split("\n");
  for (let i = 0; i < Math.max(la.length, lb.length); i++) if (la[i] !== lb[i]) return `line ${i + 1}: ${JSON.stringify(la[i])} vs ${JSON.stringify(lb[i])}`;
  return "";
}
function firstDiff(a: string[], b: string[]): string {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return `paragraph ${i + 1}: ${JSON.stringify(a[i])} vs ${JSON.stringify(b[i])}`;
  return "";
}

// ─── 2. Equations ────────────────────────────────────────────────────────────

function equations() {
  const cases = [
    "n = N / (1 + N(e²))",
    "GDP = β0 + β1(INF) + β2(EXR) + ε",
    "P_panel = (P_load × t × SF) / η_charge",
    "σ = P / A",
    "x̄ = Σx_i / n",
    "Y_t = α + βX_t + μ_t",
    "f_cm = f_ck + 1.64s",
    "E = mc²",
    "r = √(x² + y²)",
    "ln(Y) = a + b ln(X)",
    "y′ = 2x",
    "CV = (s / x̄) × 100",
  ];
  for (const text of cases) {
    const { nodes, structured } = parseEquation(text);
    const dom = new DOMParser().parseFromString(toOmml(nodes), "text/xml");
    const lin = ommlToLinear(dom.documentElement as unknown as Element);
    const again = parseEquation(lin.text);
    eq(`equation "${text}" reads back to the same structure`, linearText(again.nodes), linearText(nodes));
    check(`equation "${text}" stays a structured equation`, again.structured === structured);
    eq(`equation "${text}" loses nothing`, lin.lossy, []);
  }
  // What Word itself writes: a delimiter, an n-ary sum, a function, a matrix.
  const M = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';
  const r = (t: string) => `<m:r><m:t>${t}</m:t></m:r>`;
  const word = (inner: string) => ommlToLinear(new DOMParser().parseFromString(`<m:oMath ${M}>${inner}</m:oMath>`, "text/xml").documentElement as unknown as Element);
  eq("Word delimiter", word(`${r("y")}${r("=")}<m:d><m:e>${r("a+b")}</m:e></m:d>`).text, "y=(a+b)");
  eq(
    "Word n-ary sum with limits",
    word(`<m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub>${r("i=1")}</m:sub><m:sup>${r("n")}</m:sup><m:e><m:sSub><m:e>${r("x")}</m:e><m:sub>${r("i")}</m:sub></m:sSub></m:e></m:nary>`).text,
    "∑_{i=1}^{n}x_{i}",
  );
  eq("Word function", word(`<m:func><m:fName>${r("ln")}</m:fName><m:e>${r("x")}</m:e></m:func>`).text, "ln(x)");
  check("a Word matrix is flattened and named", word(`<m:m><m:mr><m:e>${r("1")}</m:e><m:e>${r("2")}</m:e></m:mr></m:m>`).lossy.some((l) => /matrix/.test(l)));
  check("a cube root is named", word(`<m:rad><m:deg>${r("3")}</m:deg><m:e>${r("x")}</m:e></m:rad>`).lossy.some((l) => /degree 3/.test(l)));
}

// ─── 3. What a specialist does in Word ───────────────────────────────────────

const EDIT_CHAPTER = `[H1] CHAPTER THREE
[H1] RESEARCH METHODOLOGY
[H2] 3.1 Introduction
This chapter explains the method (Okafor et al., 2020).

[H2] 3.2 Research Design
A survey design was adopted for the study.

Table 3.1: Distribution of the Sample
| Market | Population | Sample |
|---|---|---|
| Balogun | 400 | 120 |
Source: Field Survey, 2026

[EQ] n = N / (1 + N(e²)) | 3.1 [/EQ]

[FIGURE PLACEHOLDER: map of the study area]
Figure 3.1: Map of the Study Area`;

/** A 2 x 1 PNG (red, blue). */
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAEElEQVR4nGP4z8DAwMDAAAAGBAH9D9IS8gAAAABJRU5ErkJggg==", "base64"));

async function baseChapter(): Promise<{ input: AssemblyInput; zip: JSZip; doc: string }> {
  const input = withChapter(assemblyInput(false), 3, EDIT_CHAPTER);
  const { buffer } = await packChapter(input, 3, { sourceHash: "base" });
  const zip = await JSZip.loadAsync(buffer);
  return { input, zip, doc: await zip.file("word/document.xml")!.async("string") };
}

async function edited(change: (z: { zip: JSZip; doc: string }) => Promise<string> | string): Promise<{ input: AssemblyInput; result: ReadChapterResult; bytes: Uint8Array }> {
  const { input, zip, doc } = await baseChapter();
  const next = await change({ zip, doc });
  zip.file("word/document.xml", next);
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return { input, result: await read(bytes, input, 3), bytes };
}

const replaceOnce = (s: string, find: string, replace: string) => {
  const at = s.indexOf(find);
  if (at === -1) throw new Error(`fixture edit: "${find.slice(0, 60)}" not found`);
  return s.slice(0, at) + replace + s.slice(at + find.length);
};

/** The paragraph element (…<w:p>…</w:p>) that contains `text`. */
function paragraphWith(doc: string, text: string): string {
  const at = doc.indexOf(text);
  const start = doc.lastIndexOf("<w:p>", at) >= doc.lastIndexOf("<w:p ", at) ? doc.lastIndexOf("<w:p>", at) : doc.lastIndexOf("<w:p ", at);
  const end = doc.indexOf("</w:p>", at) + "</w:p>".length;
  return doc.slice(start, end);
}

const drawingXml = (rId: string, uri = "http://schemas.openxmlformats.org/drawingml/2006/picture", cx = 1905000, cy = 952500) =>
  `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="99" name="Picture 99"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="${uri}">${
    uri.endsWith("/picture")
      ? `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="map.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr/></pic:pic>`
      : `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="${rId}"/>`
  }</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

async function addRel(zip: JSZip, id: string, type: string, target: string) {
  const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
  zip.file("word/_rels/document.xml.rels", rels.replace("</Relationships>", `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/></Relationships>`));
}

async function wordEdits() {
  const { input, zip } = await baseChapter();
  const baseline = await read(await zip.generateAsync({ type: "uint8array" }), input, 3);
  eq("edit base: nothing blocks", baseline.blocking, []);

  // Translated style ids: German Word saves Heading 2 as "berschrift2" (the name stays "heading 2").
  {
    const { result } = await edited(async ({ zip, doc }) => {
      const styles = await zip.file("word/styles.xml")!.async("string");
      zip.file("word/styles.xml", styles.replace(/w:styleId="Heading2"/g, 'w:styleId="berschrift2"').replace(/<w:name w:val="Heading 2"\/>/, '<w:name w:val="heading 2"/>'));
      return doc.replace(/w:val="Heading2"/g, 'w:val="berschrift2"');
    });
    check("translated heading style id: sections still read as Heading 2", result.markup.includes("[H2] 3.1 Introduction") && result.markup.includes("[H2] 3.2 Research Design"));
    eq("translated heading style id: same text as the original", result.markup, baseline.markup);
  }

  // Tracked changes: an insertion kept, a deletion dropped.
  {
    const { result } = await edited(({ doc }) =>
      replaceOnce(
        doc,
        ">A survey design was adopted for the study.</w:t>",
        '>A </w:t></w:r><w:del w:id="91" w:author="Specialist"><w:r><w:delText>survey</w:delText></w:r></w:del><w:ins w:id="92" w:author="Specialist"><w:r><w:t>cross-sectional survey</w:t></w:r></w:ins><w:r><w:t xml:space="preserve"> design was adopted for the study.</w:t>',
      ),
    );
    check("tracked changes: insertion kept, deletion dropped", result.markup.includes("A cross-sectional survey design was adopted for the study.") && !result.markup.includes("A survey design"));
    check("tracked changes: reported", result.flags.some((f) => /Tracked changes/.test(f)));
    eq("tracked changes: counted", [result.summary.trackedInsertions, result.summary.trackedDeletions], [1, 1]);
  }

  // Runs Word split for spelling marks join again.
  {
    const { result } = await edited(({ doc }) => replaceOnce(doc, ">This chapter explains", '>This chap</w:t></w:r><w:proofErr w:type="spellStart"/><w:r><w:t xml:space="preserve">ter explains'));
    eq("split runs and spelling marks: the same text", result.markup, baseline.markup);
  }

  // A comment is never part of the report.
  {
    const { result } = await edited(async ({ zip, doc }) => {
      zip.file(
        "word/comments.xml",
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:comment w:id="0" w:author="COO"><w:p><w:r><w:t>Check this sentence</w:t></w:r></w:p></w:comment></w:comments>',
      );
      return replaceOnce(doc, ">A survey design was adopted for the study.</w:t></w:r>", '>A survey design was adopted for the study.</w:t></w:r><w:commentRangeStart w:id="0"/><w:r><w:commentReference w:id="0"/></w:r>');
    });
    eq("comment: the text is unchanged", result.markup, baseline.markup);
    check("comment: reported as left out", result.flags.some((f) => /comment/.test(f)) && result.summary.comments === 1);
  }

  // A Word footnote becomes the chapter's note.
  {
    const { result } = await edited(async ({ zip, doc }) => {
      const notes = await zip.file("word/footnotes.xml")!.async("string");
      zip.file("word/footnotes.xml", notes.replace("</w:footnotes>", '<w:footnote w:id="7"><w:p><w:r><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> Field notes, Balogun market, 2026.</w:t></w:r></w:p></w:footnote></w:footnotes>'));
      return replaceOnce(doc, ">A survey design was adopted for the study.</w:t></w:r>", '>A survey design was adopted for the study.</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="7"/></w:r>');
    });
    check("Word footnote: a note marker in the text", result.markup.includes("adopted for the study.^1"));
    check("Word footnote: the note at the chapter's end", /\[ENDNOTES\]\n1\. Field notes, Balogun market, 2026\.$/.test(result.markup));
    check("Word footnote: reported", result.flags.some((f) => /footnote/.test(f)) && result.summary.wordNotes === 1);
  }

  // A PNG picture in place of the placeholder: kept, and the caption attaches to it.
  let imageBytes: Uint8Array | null = null;
  {
    const { result, bytes } = await edited(async ({ zip, doc }) => {
      zip.file("word/media/imageQA.png", PNG);
      await addRel(zip, "rIdQA1", "image", "media/imageQA.png");
      const placeholder = paragraphWith(doc, "[FIGURE PLACEHOLDER: map of the study area]");
      return replaceOnce(doc, placeholder, `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${drawingXml("rIdQA1")}</w:p>`);
    });
    imageBytes = bytes;
    check("PNG picture: an [IMAGE] line", /\[IMAGE: word\/media\/imageQA\.png \| 200x100\]/.test(result.markup), result.markup.slice(-200));
    eq("PNG picture: nothing blocks", result.blocking, []);
    const fig = parseChapter(result.markup, 3).blocks.find((b) => b.kind === "figure");
    check("PNG picture: its caption attaches", fig?.kind === "figure" && fig.image?.key === "word/media/imageQA.png" && fig.caption === "Figure 3.1: Map of the Study Area");
    eq("PNG picture: one asset with its size", result.assets.map((a) => [a.key, a.type, a.width, a.height]), [["word/media/imageQA.png", "png", 200, 100]]);
    // The report puts the picture in, and reading that chapter back gives the same text.
    const media = new Map([["word/media/imageQA.png", { data: PNG, type: "png" as const }]]);
    const withImage = { ...withChapter(input, 3, result.markup), media };
    const { buffer } = await packChapter(withImage, 3, { sourceHash: "img" });
    const zip2 = await JSZip.loadAsync(buffer);
    const doc2 = await zip2.file("word/document.xml")!.async("string");
    check("PNG picture: the built chapter holds a real picture", doc2.includes("<w:drawing>") && Object.keys(zip2.files).some((f) => f.startsWith("word/media/")));
    const again = await read(buffer, withImage, 3);
    eq("PNG picture: reading the built chapter gives the same text (bar the picture's name)", again.markup.replace(/\[IMAGE: [^|]+\|/, "[IMAGE: x |"), result.markup.replace(/\[IMAGE: [^|]+\|/, "[IMAGE: x |"));
    const { doc: full } = buildReportDocument(withImage);
    const fullXml = await (await JSZip.loadAsync(await Packer.toBuffer(full))).file("word/document.xml")!.async("string");
    check("PNG picture: the complete report holds it", fullXml.includes("<w:drawing>"));
    // A missing picture never breaks the build: a placeholder and a warning.
    const { report } = buildReportDocument(withChapter(input, 3, result.markup));
    check("a picture that cannot be loaded leaves a placeholder and a warning", report.chapters.find((c) => c.number === 3)?.warnings.some((w) => /could not be loaded/.test(w)) === true);
  }
  void imageBytes;

  // Formats and objects that would be lost block approval.
  {
    const emf = await edited(async ({ zip, doc }) => {
      zip.file("word/media/imageQA.emf", new Uint8Array([1, 0, 0, 0]));
      await addRel(zip, "rIdQA2", "image", "media/imageQA.emf");
      return replaceOnce(doc, paragraphWith(doc, "[FIGURE PLACEHOLDER: map of the study area]"), `<w:p>${drawingXml("rIdQA2")}</w:p>`);
    });
    check("EMF picture: blocks, naming the file", emf.result.blocking.some((b) => /imageQA\.emf/.test(b) && /EMF/.test(b)));
    const chart = await edited(({ doc }) => replaceOnce(doc, paragraphWith(doc, "[FIGURE PLACEHOLDER: map of the study area]"), `<w:p>${drawingXml("rIdX", "http://schemas.openxmlformats.org/drawingml/2006/chart")}</w:p>`));
    check("live chart: blocks", chart.result.blocking.some((b) => /live chart/.test(b)));
    const smart = await edited(({ doc }) => replaceOnce(doc, paragraphWith(doc, "[FIGURE PLACEHOLDER: map of the study area]"), `<w:p>${drawingXml("rIdX", "http://schemas.openxmlformats.org/drawingml/2006/diagram")}</w:p>`));
    check("SmartArt: blocks", smart.result.blocking.some((b) => /SmartArt/.test(b)));
    const ole = await edited(({ doc }) => replaceOnce(doc, paragraphWith(doc, "[FIGURE PLACEHOLDER: map of the study area]"), `<w:p><w:r><w:object/></w:r></w:p>`));
    check("embedded object: blocks", ole.result.blocking.some((b) => /embedded object/.test(b)));
    const group = await edited(({ doc }) => replaceOnce(doc, paragraphWith(doc, "[FIGURE PLACEHOLDER: map of the study area]"), `<w:p>${drawingXml("rIdX", "http://schemas.microsoft.com/office/word/2010/wordprocessingGroup")}</w:p>`));
    check("a group of shapes: blocks", group.result.blocking.some((b) => /group of drawing shapes/.test(b)));
  }

  // A text box: its text comes into the body, reported.
  {
    const box = `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="1" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:extent cx="1000" cy="1000"/><wp:docPr id="98" name="Text Box"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:txbx><w:txbxContent><w:p><w:r><w:t>Boxed note on the sampling frame.</w:t></w:r></w:p></w:txbxContent></wps:txbx></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
    const { result } = await edited(({ doc }) => replaceOnce(doc, ">A survey design was adopted for the study.</w:t></w:r>", `>A survey design was adopted for the study.</w:t></w:r>${box}`));
    check("text box: its text is carried", result.markup.includes("Boxed note on the sampling frame."));
    check("text box: reported", result.flags.some((f) => /text box/.test(f)));
  }

  // Word's caption numbering (a SEQ field showing "1") becomes the chapter's number.
  {
    const { result } = await edited(({ doc }) =>
      replaceOnce(
        doc,
        ">Table 3.1: Distribution of the Sample</w:t>",
        '>Table </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> SEQ Table \\* ARABIC </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:r><w:t xml:space="preserve">: Distribution of the Sample</w:t>',
      ),
    );
    check("caption field: Table 1 is written Table 3.1", result.markup.includes("Table 3.1: Distribution of the Sample") && !result.markup.includes("SEQ"));
    check("caption field: reported", result.flags.some((f) => /caption numbers/.test(f)));
  }

  // Word's own lists and a numbered heading.
  {
    const { result } = await edited(async ({ zip, doc }) => {
      zip.file(
        "word/numbering.xml",
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="50"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="lowerRoman"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="51"><w:lvl w:ilvl="0"><w:start w:val="3"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl><w:lvl w:ilvl="1"><w:start w:val="3"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2"/></w:lvl></w:abstractNum><w:num w:numId="60"><w:abstractNumId w:val="50"/></w:num><w:num w:numId="61"><w:abstractNumId w:val="51"/></w:num></w:numbering>',
      );
      const item = (t: string) => `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="60"/></w:numPr></w:pPr><w:r><w:t>${t}</w:t></w:r></w:p>`;
      const heading = `<w:p><w:pPr><w:pStyle w:val="Heading2"/><w:numPr><w:ilvl w:val="1"/><w:numId w:val="61"/></w:numPr></w:pPr><w:r><w:t>Population of the Study</w:t></w:r></w:p>`;
      const after = paragraphWith(doc, "A survey design was adopted for the study.");
      return replaceOnce(doc, after, `${after}${item("examine adoption;")}${item("assess trust.")}${heading}`);
    });
    check("Word list: numbered i. and ii.", result.markup.includes("i. examine adoption;") && result.markup.includes("ii. assess trust."));
    check("Word numbered heading: 3.3 before its text", result.markup.includes("[H2] 3.3 Population of the Study"), result.markup);
  }

  // An equation typed on its own line (outside a table), numbered in brackets.
  {
    const math = `<w:p><m:oMathPara><m:oMath><m:r><m:t>y</m:t></m:r><m:r><m:t>=</m:t></m:r><m:r><m:t>a</m:t></m:r><m:r><m:t>+</m:t></m:r><m:r><m:t>bx</m:t></m:r></m:oMath></m:oMathPara><w:r><w:tab/><w:t>(3.2)</w:t></w:r></w:p>`;
    const { result } = await edited(({ doc }) => replaceOnce(doc, paragraphWith(doc, "A survey design was adopted for the study."), `${paragraphWith(doc, "A survey design was adopted for the study.")}${math}`));
    check("equation outside a table: an [EQ] block with its number", result.markup.includes("[EQ] y=a+bx | 3.2 [/EQ]"), result.markup);
    check("equation numbered in brackets: reported", result.flags.some((f) => /brackets/.test(f)));
    const inline = await edited(({ doc }) => replaceOnce(doc, ">A survey design was adopted for the study.</w:t></w:r>", '>A survey design where </w:t></w:r><m:oMath><m:r><m:t>n</m:t></m:r></m:oMath><w:r><w:t xml:space="preserve"> is the sample was adopted.</w:t></w:r>'));
    check("equation inside a sentence: kept as text, reported", inline.result.markup.includes("A survey design where n is the sample was adopted.") && inline.result.flags.some((f) => /inside a sentence/.test(f)));
  }

  // A paragraph mark deleted with tracked changes joins two paragraphs.
  {
    const { result } = await edited(({ doc }) => {
      const p = paragraphWith(doc, "A survey design was adopted for the study.");
      const joined = p.replace("<w:p>", '<w:p><w:pPr><w:rPr><w:del w:id="93" w:author="Specialist"/></w:rPr></w:pPr>');
      return replaceOnce(doc, p, `${joined}<w:p><w:r><w:t xml:space="preserve"> It suited the study.</w:t></w:r></w:p>`);
    });
    check("deleted paragraph mark: the two paragraphs are one", result.markup.includes("A survey design was adopted for the study. It suited the study."), result.markup);
  }

  // Markup typed as text never becomes markup.
  {
    const { result } = await edited(({ doc }) => replaceOnce(doc, ">A survey design was adopted for the study.</w:t>", ">[H2] Typed as a tag, [TABLE] and [ENDNOTES] stay words in the sentence.</w:t>"));
    const blocks = parseChapter(result.markup, 3).blocks;
    check(
      "typed markup: read as a paragraph, not a heading, table or notes",
      blocks.filter((b) => b.kind === "heading").length === 2 &&
        blocks.some((b) => b.kind === "paragraph" && /Typed as a tag/.test(b.text)) &&
        blocks.filter((b) => b.kind === "table").length === 1 &&
        !blocks.some((b) => b.kind === "endnotes"),
      result.markup,
    );
  }

  // Bold, italics, sub- and superscripts.
  {
    const { result } = await edited(({ doc }) =>
      replaceOnce(
        doc,
        ">A survey design was adopted for the study.</w:t></w:r>",
        '>A survey design was </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>adopted</w:t></w:r><w:r><w:t xml:space="preserve"> using </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>in situ</w:t></w:r><w:r><w:t xml:space="preserve"> checks; R</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t xml:space="preserve"> rose and CO</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t xml:space="preserve"> fell where f</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>m</w:t></w:r><w:r><w:t xml:space="preserve"> held.</w:t></w:r>',
      ),
    );
    check("bold dropped, reported", result.markup.includes("was adopted using") && result.flags.some((f) => /Bold/.test(f)));
    check("italics kept", result.markup.includes("*in situ*"));
    check("R² and CO₂ kept as characters", result.markup.includes("R² rose") && result.markup.includes("CO₂ fell"));
    check("a symbol's subscript written f_m", result.markup.includes("where f_m held."));
  }

  // A fourth heading level, a table of contents, a table caption under its table, Word's "caption" style.
  {
    const { result } = await edited(({ doc }) => {
      const toc = '<w:p><w:pPr><w:pStyle w:val="TOC1"/></w:pPr><w:r><w:t>3.1 Introduction 1</w:t></w:r></w:p>';
      const h4 = '<w:p><w:pPr><w:pStyle w:val="Heading4"/></w:pPr><w:r><w:t>3.2.1.1 Too deep</w:t></w:r></w:p>';
      const intro = paragraphWith(doc, "This chapter explains the method");
      let out = replaceOnce(doc, intro, `${toc}${intro}${h4}`);
      const caption = paragraphWith(out, "Table 3.1: Distribution of the Sample");
      out = replaceOnce(out, caption, "");
      const source = paragraphWith(out, "Source: Field Survey, 2026");
      return replaceOnce(out, source, `${caption.replace('w:val="TableCaption"', 'w:val="Caption"')}${source}`);
    });
    check("table of contents: left out, reported", !result.markup.includes("Introduction 1") && result.flags.some((f) => /table of contents/.test(f)));
    check("fourth heading level: a sub-section, reported", result.markup.includes("[H3] 3.2.1.1 Too deep") && result.flags.some((f) => /fourth heading level/.test(f)));
    const table = parseChapter(result.markup, 3).blocks.find((b) => b.kind === "table");
    check("a caption under its table moves above it", table?.kind === "table" && table.caption === "Table 3.1: Distribution of the Sample" && result.flags.some((f) => /moved above/.test(f)), result.markup);
  }

  // The wrong file.
  {
    const other = await edited(async ({ zip, doc }) => {
      const custom = await zip.file("docProps/custom.xml")!.async("string");
      zip.file("docProps/custom.xml", custom.replace("<vt:lpwstr>EC-CHECK</vt:lpwstr>", "<vt:lpwstr>EC-99999</vt:lpwstr>"));
      return doc;
    });
    check("a file stamped for another project: blocks", other.result.blocking.some((b) => /EC-99999/.test(b)));
    const wrong = await edited(async ({ zip, doc }) => {
      const custom = await zip.file("docProps/custom.xml")!.async("string");
      zip.file("docProps/custom.xml", custom.replace("<vt:lpwstr>3</vt:lpwstr>", "<vt:lpwstr>4</vt:lpwstr>"));
      return doc;
    });
    check("a file stamped for another chapter: blocks", wrong.result.blocking.some((b) => /Chapter 4, not Chapter 3/.test(b)));
    const heading = await edited(({ doc }) => doc.replace(">CHAPTER THREE<", ">CHAPTER FOUR<"));
    check("a chapter heading for another chapter: reported, not blocking", heading.result.flags.some((f) => /CHAPTER FOUR/.test(f)) && heading.result.blocking.length === 0);
    let threw = false;
    try {
      await readChapterDocx(new TextEncoder().encode("%PDF-1.4 not a docx"), { chapter: 3 });
    } catch {
      threw = true;
    }
    check("a file that is not a Word document is refused", threw);
  }

  eq("reader version is recorded", baseline.readerVersion, READER_VERSION);
  check("IMAGE line syntax", IMAGE_LINE.test("[IMAGE: v1/word/media/image1.png | 600x400]"));

  // A number typed inside the equation after a tab (Word keeps it in the maths): split off as the number.
  {
    const math = `<w:p><m:oMathPara><m:oMath><m:r><m:t>y=</m:t></m:r><m:f><m:num><m:r><m:t>a+b</m:t></m:r></m:num><m:den><m:r><m:t>c</m:t></m:r></m:den></m:f><m:r><w:tab/><m:t>3.4</m:t></m:r></m:oMath></m:oMathPara></w:p>`;
    const { result } = await edited(({ doc }) => replaceOnce(doc, paragraphWith(doc, "A survey design was adopted for the study."), `${paragraphWith(doc, "A survey design was adopted for the study.")}${math}`));
    check("a number typed inside the equation after a tab becomes its number", result.markup.includes("[EQ] y=(a+b)/c | 3.4 [/EQ]"), result.markup);
    const value = await edited(({ doc }) => replaceOnce(doc, paragraphWith(doc, "A survey design was adopted for the study."), `${paragraphWith(doc, "A survey design was adopted for the study.")}<w:p><m:oMathPara><m:oMath><m:r><m:t>x = 3.1</m:t></m:r></m:oMath></m:oMathPara></w:p>`));
    check("x = 3.1 stays a value, not a number", value.result.markup.includes("[EQ] x = 3.1 |  [/EQ]"), value.result.markup);
    const inHeading = await edited(({ doc }) => replaceOnce(doc, paragraphWith(doc, "A survey design was adopted for the study."), `${paragraphWith(doc, "A survey design was adopted for the study.")}<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><m:oMathPara><m:oMath><m:r><m:t>y=a+bx</m:t></m:r><m:r><w:tab/><m:t>3.5</m:t></m:r></m:oMath></m:oMathPara></w:p>`));
    check("an equation alone in a heading-styled line is an equation, not a heading", inHeading.result.markup.includes("[EQ] y=a+bx | 3.5 [/EQ]") && !inHeading.result.markup.includes("[H2] y="), inHeading.result.markup);
    const captionItalic = await edited(async ({ zip, doc }) => {
      const styles = await zip.file("word/styles.xml")!.async("string");
      zip.file("word/styles.xml", styles.replace("</w:styles>", '<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:rPr><w:i/></w:rPr></w:style></w:styles>'));
      const cap = paragraphWith(doc, "Figure 3.1: Map of the Study Area");
      return replaceOnce(doc, cap, cap.replace(/w:val="FigureCaption"/, 'w:val="Caption"'));
    });
    check("Word's italic Caption style does not make the caption italic", captionItalic.result.markup.includes("\nFigure 3.1: Map of the Study Area") && !captionItalic.result.markup.includes("*Figure 3.1"), captionItalic.result.markup.slice(-200));
  }
}

// ─── 4. Chapters edited in real Microsoft Word 16 (regression fixtures, 30 Sept 2026) ─
/**
 * Two AI drafts of the quality fixture, edited in Word as a specialist would: Track Changes on (a sentence
 * added, a word deleted), a comment, a table cell corrected, an equation typed with Word's editor and
 * numbered after a tab inside it, and a PNG picture (Chapter 1: with Word's own SEQ caption; Chapter 2: in
 * place of the figure placeholder). Saved by Word, never touched by code.
 */
async function realWord() {
  const dir = join(__dirname, "fixtures");
  const one = await readChapterDocx(readFileSync(join(dir, "word-edited-chapter1.docx")), { chapter: 1, projectCode: "EC-QA-CR-A" });
  const two = await readChapterDocx(readFileSync(join(dir, "word-edited-chapter2.docx")), { chapter: 2, projectCode: "EC-QA-CR-A" });
  for (const [label, r] of [["Word chapter 1", one], ["Word chapter 2", two]] as const) {
    eq(`${label}: nothing blocks`, r.blocking, []);
    check(`${label}: the tracked insertion is kept`, r.markup.includes("As revised by the specialist, the study remains focused on its stated objectives."));
    check(`${label}: Word's equation, numbered after a tab inside it`, /\[EQ\] y=\(a\+b\)\/c \| \d\.9 \[\/EQ\]/.test(r.markup), r.markup.match(/\[EQ\][^\n]*/)?.[0]);
    check(`${label}: the picture, with its size`, /\[IMAGE: word\/media\/image1\.png \| 480x300\]/.test(r.markup));
    check(`${label}: tracked changes counted`, r.summary.trackedInsertions >= 1 && r.summary.trackedDeletions === 1);
    check(`${label}: no caption set in italics`, !/\*Figure/.test(r.markup));
    check(`${label}: stamped for its chapter`, r.summary.stamp?.chapter === (label.endsWith("1") ? 1 : 2));
  }
  check("Word chapter 1: the deleted word is gone", !/\bAdoption has not been even\b/.test(one.markup) && one.markup.includes("has not been even across market groups"));
  check("Word chapter 1: Word's caption number written as the chapter's", one.markup.includes("Figure 1.1: Sampling frame of the study (Researcher, 2026)") && one.flags.some((f) => /caption numbers/.test(f)));
  check("Word chapter 1: the comment is left out, and said", one.summary.comments === 1 && one.flags.some((f) => /comment/.test(f)));
  check("Word chapter 2: the corrected table cell", two.markup.includes("| Sales rose (checked) |"));
  check("Word chapter 2: the picture took the placeholder's place, its caption kept", !two.markup.includes("[FIGURE PLACEHOLDER") && two.markup.includes("[IMAGE: word/media/image1.png | 480x300]\n\nFigure 2.1: Conceptual framework of the study (Researcher, 2026)"));
  const fig = parseChapter(two.markup, 2).blocks.find((b) => b.kind === "figure");
  check("Word chapter 2: the builder reads the picture and its caption as one figure", fig?.kind === "figure" && fig.image?.key === "word/media/image1.png" && fig.caption === "Figure 2.1: Conceptual framework of the study (Researcher, 2026)");
}

async function main() {
  await roundTrips();
  equations();
  await wordEdits();
  await realWord();
  if (failures.length) {
    console.error(`check:chapterdocx — ${failures.length} failed, ${passed} passed:`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`check:chapterdocx — all ${passed} checks passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
