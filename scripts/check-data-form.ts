/**
 * Phase D3c checks — the dynamic data form's pure parts, with no database and
 * no Claude call: where each mode pauses, the rules a drafted request must
 * meet (formats per mode, the specificity guard, never generic), a worker's
 * submission, the text the later chapters get, text read from Excel/CSV,
 * the first-bytes checks, the PDF page count, and the chapter calls with the
 * data attached (never more than 4 cache breakpoints).
 *
 *   npm run check:dataform
 */
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import {
  DATA_FORM_TEXT,
  FORM_LIMITS,
  MODE_FORMATS,
  dataFormUserPrompt,
  distinctiveWords,
  formatWorkerData,
  pauseKind,
  pausePointsFor,
  pausesBeforeChapter,
  readFormSpec,
  validateDataForm,
  validateSubmission,
  type DataFormContext,
  type DataFormSpec,
  type WorkerData,
} from "../src/lib/generation/dynamic-data-form";
import { MAX_EXTRACTED_CHARS, capText, dataFileKind, extractDataText, roughPdfPages } from "../src/lib/files/extract-text";
import { acceptAttribute, allowedKindsLabel, canUpload, contentTypeFor, magicMatches, maxBytesFor } from "../src/lib/files/policy";
import { parsePrivatePath } from "../src/lib/files/paths";
import { buildPlan, outlineUserBlocks, partUserBlocks, type AttachmentBlock, type UserBlock } from "../src/lib/generation/chapter-plan";
import { dataInputChecklist, loadChapterPrompt, type ChapterPromptInput } from "../src/lib/generation/prompt-loader";

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else failures.push(`${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}

// Test fixtures only — not a real project.
const TOPIC = "Student satisfaction with library services at the University of Lagos (UNILAG)";
const GOOD = {
  title: "Upload your survey analysis for the UNILAG library study",
  description:
    "Please upload your SPSS output, exported as PDF, containing the frequency tables and regression results for your five Likert-scale questions measuring student satisfaction with library services at UNILAG, with the Cronbach's alpha for the scale.",
  files: [
    { key: "SPSS Output", label: "SPSS output (PDF)", description: "Frequency tables for items 1–5, Cronbach's alpha, the regression for H1", formats: ["PDF"], required: true },
    { key: "responses", label: "Coded responses", description: "One row per respondent", formats: [".xlsx", "csv", "pptx"], required: false },
  ],
  fields: [
    { key: "distributed", label: "Questionnaires distributed", type: "number", required: true, help: "Chapter 3 planned 350" },
    { key: "returned", label: "Questionnaires returned and usable", type: "number", required: true },
    { key: "software", label: "Software and version", type: "text", required: true },
    { key: "faculty", label: "Faculty surveyed most", type: "select", required: false, options: ["Arts", "Science", "Law"] },
    { key: "changes", label: "Anything that changed from Chapter 3", type: "textarea", required: false },
  ],
  checklist: ["Frequency table for each of the five items", "Mean and standard deviation per item", "Cronbach's alpha", "Regression output for H1 (R², F, p-value)"],
};

async function main() {
  // ─── Where each mode pauses ───────────────────────────────────────────────
  check("mode 1 never pauses", pausePointsFor(1).length === 0);
  check("mode 5 never pauses", pausePointsFor(5).length === 0);
  check("mode 2 pauses after Chapter 3", JSON.stringify(pausePointsFor(2)) === "[3]");
  check("mode 3 pauses after Chapters 2 and 3", JSON.stringify(pausePointsFor(3)) === "[2,3]");
  check("mode 4 pauses after Chapter 3", JSON.stringify(pausePointsFor(4)) === "[3]");
  check("an unknown mode never pauses", pausePointsFor(9).length === 0);
  check("mode 3 after Chapter 2 asks for the build specification", pauseKind(3, 2) === "SPECIFICATION");
  check("mode 3 after Chapter 3 asks for results", pauseKind(3, 3) === "RESULTS");
  check("mode 2 after Chapter 3 asks for results", pauseKind(2, 3) === "RESULTS");
  check("mode 2: Chapters 1–3 need no data", [1, 2, 3].every((c) => pausesBeforeChapter(2, c).length === 0));
  check("mode 2: Chapters 4 and 5 need the pause after Chapter 3", JSON.stringify(pausesBeforeChapter(2, 4)) === "[3]" && JSON.stringify(pausesBeforeChapter(2, 5)) === "[3]");
  check("mode 3: Chapter 3 needs the specification", JSON.stringify(pausesBeforeChapter(3, 3)) === "[2]");
  check("mode 3: Chapter 4 needs both pauses", JSON.stringify(pausesBeforeChapter(3, 4)) === "[2,3]");
  check("mode 1: Chapter 5 needs nothing", pausesBeforeChapter(1, 5).length === 0);

  // ─── The request Claude drafts ────────────────────────────────────────────
  const good = validateDataForm(GOOD, { mode: 2, topic: TOPIC });
  check("a project-specific request passes", good.ok, good.ok ? undefined : good.problems);
  if (good.ok) {
    const f = good.form;
    check("keys become slugs", f.files[0].key === "spss_output");
    check("formats are lower-cased, dot-less and limited to the mode", JSON.stringify(f.files[1].formats) === JSON.stringify(["xlsx", "csv"]));
    check("the description is kept word for word", f.description === GOOD.description);
    check("a select keeps its options", f.fields.find((x) => x.key === "faculty")?.options.length === 3);
    check("a missing help becomes null", f.fields.find((x) => x.key === "returned")?.help === null);
    check("the stored form reads back", readFormSpec(JSON.parse(JSON.stringify(f)))?.description === f.description);
  }
  check("a broken stored form reads back as null", readFormSpec({ title: "x" }) === null && readFormSpec(null) === null);

  const generic = validateDataForm({ ...GOOD, description: "Please upload your file." }, { mode: 2, topic: TOPIC });
  check("a generic description is refused", !generic.ok && generic.problems.some((p) => /generic|at least/.test(p)));
  const vague = validateDataForm(
    { ...GOOD, description: "Please upload your statistical output as a PDF with all the tables and the tests you ran, plus anything else your supervisor asked for." },
    { mode: 2, topic: TOPIC },
  );
  check("a long description that never names the project is refused", !vague.ok && vague.problems.some((p) => p.includes("does not name this project")));
  check("the topic's distinctive words skip the filler", JSON.stringify(distinctiveWords(TOPIC)) === JSON.stringify(["satisfaction", "library", "services", "lagos", "unilag"]));
  const tooLong = validateDataForm({ ...GOOD, description: `${GOOD.description} ${"x".repeat(400)}` }, { mode: 2, topic: TOPIC });
  check("an over-long description is refused", !tooLong.ok && tooLong.problems.some((p) => p.includes("at most")));

  const images = validateDataForm({ ...GOOD, files: [{ key: "shots", label: "Screenshots", description: "x", formats: ["png", "jpeg"], required: true }] }, { mode: 2, topic: TOPIC });
  check("mode 2 refuses a slot with only image formats", !images.ok && images.problems.some((p) => p.includes("Screenshots")));
  const mode3 = validateDataForm(
    { ...GOOD, files: [{ key: "shots", label: "Screenshots of the system", description: "x", formats: ["png", "JPEG", "xlsx"], required: false }] },
    { mode: 3, topic: TOPIC },
  );
  check("mode 3 accepts screenshots, jpeg becomes jpg, xlsx is dropped", mode3.ok && JSON.stringify(mode3.form.files[0].formats) === '["png","jpg"]');
  check("the first slot becomes required when none is", mode3.ok && mode3.form.files[0].required === true);
  check("mode 4 accepts every data format", MODE_FORMATS[4].length === 6);

  const noFiles = validateDataForm({ ...GOOD, files: [] }, { mode: 2, topic: TOPIC });
  check("a request with no upload slot is refused", !noFiles.ok && noFiles.problems.some((p) => p.includes("at least one upload slot")));
  const oneField = validateDataForm({ ...GOOD, fields: GOOD.fields.slice(0, 1) }, { mode: 2, topic: TOPIC });
  check("fewer than two fields is refused", !oneField.ok);
  const twoLines = validateDataForm({ ...GOOD, checklist: GOOD.checklist.slice(0, 2) }, { mode: 2, topic: TOPIC });
  check("fewer than three checklist lines is refused", !twoLines.ok);
  const fourFiles = validateDataForm({ ...GOOD, files: [0, 1, 2, 3].map((i) => ({ key: "f", label: `File ${i}`, description: "", formats: ["pdf"], required: true })) }, { mode: 2, topic: TOPIC });
  check("at most three upload slots, keys made unique", fourFiles.ok && fourFiles.form.files.length === FORM_LIMITS.files && new Set(fourFiles.form.files.map((f) => f.key)).size === 3);
  const oneOption = validateDataForm({ ...GOOD, fields: [...GOOD.fields.slice(0, 2), { key: "s", label: "Pick", type: "select", required: false, options: ["Only"] }] }, { mode: 2, topic: TOPIC });
  check("a select with one option becomes a text field", oneOption.ok && oneOption.form.fields[2].type === "text");
  const longSlot = validateDataForm(
    { ...GOOD, files: [{ ...GOOD.files[0], description: `Complete SPSS output with the frequency tables and ${"regression results ".repeat(30)}for H1` }] },
    { mode: 2, topic: TOPIC },
  );
  const cutText = longSlot.ok ? longSlot.form.files[0].description : "";
  check("a long slot description is cut at a word end, with an ellipsis", cutText.length <= 300 && cutText.endsWith("results…"), cutText.slice(-30));
  const asString = validateDataForm({ ...GOOD, checklist: JSON.stringify({ checklist: GOOD.checklist }) }, { mode: 2, topic: TOPIC });
  check("a list sent as a JSON string is still read", asString.ok && asString.form.checklist.length === 4);

  // ─── What Claude is sent ──────────────────────────────────────────────────
  const ctx: DataFormContext = {
    topic: TOPIC,
    department: "Library and Information Science",
    mode: 2,
    kind: "RESULTS",
    afterChapter: 3,
    objectives: ["To measure satisfaction with library services", "To test whether opening hours predict satisfaction"],
    chapters: [{ number: 3, text: "3.1 Research Design\n\nA survey of 350 students." + "y".repeat(50_000) }],
    checklist: ["SPSS output (.sav)", "Cronbach's Alpha"],
  };
  const user = dataFormUserPrompt(ctx);
  check("the request names the topic, mode and objectives", user.includes(TOPIC) && user.includes("Mode 2") && user.includes("2. To test whether opening hours predict satisfaction"));
  check("a results pause carries Chapter 4's checklist", user.includes(DATA_FORM_TEXT.checklistIntro) && user.includes("- Cronbach's Alpha"));
  check("a long chapter is cut and says so", user.length < 45_000 && user.includes("[… the rest of Chapter 3 is not shown]"));
  const spec = dataFormUserPrompt({ ...ctx, mode: 3, kind: "SPECIFICATION", afterChapter: 2, chapters: [{ number: 1, text: "c1" }, { number: 2, text: "c2" }] });
  check("a specification pause explains the build, without the results checklist", spec.includes(DATA_FORM_TEXT.purpose.SPECIFICATION) && !spec.includes(DATA_FORM_TEXT.checklistIntro));
  check("the system prompt lists only the mode's formats", DATA_FORM_TEXT.system(MODE_FORMATS[3]).includes("pdf, png, jpg, docx"));

  // ─── Chapter 4's own checklist, from the prompt files ─────────────────────
  const cl2 = await dataInputChecklist(2);
  const cl3 = await dataInputChecklist(3);
  const cl4 = await dataInputChecklist(4);
  check("Mode 2's checklist comes from the Chapter 4 prompt file", cl2.some((l) => l.includes("SPSS")) && cl2.some((l) => /Cronbach/i.test(l)), cl2);
  check("Mode 3's checklist is about testing", cl3.some((l) => /test case/i.test(l)), cl3);
  check("Mode 4's checklist is about lab data", cl4.some((l) => /ANOVA|laboratory|lab/i.test(l)), cl4);
  check("Mode 1 has no data checklist", (await dataInputChecklist(1)).length === 0);

  // ─── A worker's submission ────────────────────────────────────────────────
  const form = (good as { form: DataFormSpec }).form;
  const sub = validateSubmission(form, { distributed: 350, returned: "312", software: "  SPSS 26 " }, ["spss_output"]);
  check("a complete submission passes and is trimmed", sub.ok && sub.answers.software === "SPSS 26" && sub.answers.distributed === "350");
  const missing = validateSubmission(form, { distributed: "350" }, []);
  check("missing fields and the required file are listed", !missing.ok && missing.problems.includes('Fill in "Software and version".') && missing.problems.includes('Upload "SPSS output (PDF)".'));
  const bad = validateSubmission(form, { distributed: "three hundred", returned: "1", software: "x", faculty: "Medicine" }, ["spss_output", "spss_output", "other"]);
  check("a word in a number field is refused", !bad.ok && bad.problems.some((p) => p.includes("must be a number")));
  check("a select answer outside its options is refused", !bad.ok && bad.problems.some((p) => p.includes("Pick one of the choices")));
  check("an unknown slot and a doubled slot are refused", !bad.ok && bad.problems.some((p) => p.includes("does not have")) && bad.problems.some((p) => p.includes("one file per")));

  // ─── What the later chapters get ──────────────────────────────────────────
  const data: WorkerData[] = [
    {
      afterChapter: 3,
      kind: "RESULTS",
      title: form.title,
      description: form.description,
      checklist: form.checklist,
      answers: [{ label: "Questionnaires distributed", value: "350" }],
      files: [
        { fileId: "f1", name: "spss.pdf", slot: "spss_output", kind: "document", text: null },
        { fileId: "f2", name: "responses.xlsx", slot: "responses", kind: "text", text: "Q1,Q2\n4,5" },
      ],
    },
  ];
  const block = formatWorkerData(data);
  check("the data text carries the request word for word", block.includes(`What was asked for: ${form.description}`));
  check("the data text carries the answers and the Excel text", block.includes("- Questionnaires distributed: 350") && block.includes("Q1,Q2\n4,5"));
  check("a PDF is named as attached, never pasted", block.includes("spss.pdf (spss_output) is attached to this message") && !block.includes("f1"));
  check("the no-invention rule and placeholder are there", block.includes("never invent") && block.includes("[DATA NOT PROVIDED — COO TO REVIEW]"));
  const huge = formatWorkerData([{ ...data[0], files: [{ name: "a.csv", slot: "a", kind: "text", text: "z".repeat(70_000) }, { name: "b.csv", slot: "b", kind: "text", text: "w".repeat(70_000) }] }]);
  check("all the files of a pause share one 80,000-character budget", huge.length < 82_000 && huge.includes("[… cut to keep the prompt within its limit]"));
  const spec3 = formatWorkerData([{ ...data[0], kind: "SPECIFICATION", afterChapter: 2 }]);
  check("a specification says to describe only what was built", spec3.includes("Describe the system only as it states"));

  const base: ChapterPromptInput = {
    chapter: 4,
    department: "Nursing",
    mode: 2,
    references: [{ title: "Patient satisfaction in Lagos", proposedTitle: "", authors: "Ade, B.", year: 2021, journal: "J. Test", doi: "10.1000/qa.dataform", abstract: null }],
    fromEarlierChapters: { objectives: ["To measure satisfaction"], researchQuestions: [], hypotheses: [] },
    project: {
      projectTitle: TOPIC,
      university: "University of Lagos",
      supervisorName: null,
      hodName: null,
      matricNumber: null,
      projectPartners: null,
      projectType: "PRACTICAL",
      specialInstructions: null,
      minimumPages: null,
      referencingStyle: "APA_7TH",
    },
  };
  const withData = await loadChapterPrompt({ ...base, workerData: data });
  const without = await loadChapterPrompt(base);
  check("Chapter 4 with data carries THE PROJECT'S DATA and the request", withData.text.includes("THE PROJECT'S DATA") && withData.text.includes(form.description));
  check("the data part comes after the reference list", withData.text.indexOf("THE PROJECT'S DATA") > withData.text.indexOf("Patient satisfaction in Lagos"));
  check("no data, no data part", !without.text.includes("THE PROJECT'S DATA"));

  // ─── Files: policy, first bytes, extraction ───────────────────────────────
  check("workers and admins may send data files; clients may not", canUpload("WORKER", "data") && canUpload("ADMIN", "data") && !canUpload("CLIENT", "data"));
  check("data files are at most 20 MB", maxBytesFor("data") === 20 * 1024 * 1024);
  check("csv and xlsx have content types", contentTypeFor("data", "a.csv") === "text/csv" && contentTypeFor("data", "a.xlsx") !== null);
  check("a .pptx is not a data file", contentTypeFor("data", "a.pptx") === null);
  check("the picker offers the data formats", acceptAttribute("data").includes(".xlsx") && allowedKindsLabel("data").includes("Excel"));
  check("a data path parses", parsePrivatePath("projects/cmabc123/data/cmpause1/0123456789abcdef01234567.pdf")?.purpose === "data");
  check("a source path is never an upload path", parsePrivatePath("projects/cmabc123/source/cmpause1/0123456789abcdef01234567.pdf") === null);
  const enc = (s: string) => new TextEncoder().encode(s);
  check("csv: plain text passes", magicMatches("a.csv", enc("Q1,Q2\n4,5")));
  check("csv: a BOM is fine", magicMatches("a.csv", enc("﻿Q1,Q2")));
  check("csv: an HTML page renamed .csv is refused", !magicMatches("a.csv", enc("  <html><script>")));
  check("csv: binary is refused", !magicMatches("a.csv", new Uint8Array([0x51, 0x00, 0x31])));
  check("csv: an empty file is refused", !magicMatches("a.csv", new Uint8Array()));
  check("xlsx must be a ZIP", magicMatches("a.xlsx", new Uint8Array([0x50, 0x4b, 0x03, 0x04])) && !magicMatches("a.xlsx", enc("Q1,Q2")));
  check("file kinds", dataFileKind("a.PDF") === "document" && dataFileKind("b.jpeg") === "image" && dataFileKind("c.xlsx") === "text" && dataFileKind("d.pptx") === null);

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Responses");
  sheet.addRow(["Respondent", "Q1", "Q2", "Comment"]);
  sheet.addRow([1, 4, 5, "Good, quiet"]);
  sheet.addRow([2, 3, 2, 'Said "slow"']);
  wb.addWorksheet("Empty");
  const xlsx = new Uint8Array(await wb.xlsx.writeBuffer());
  check("a real .xlsx passes the first-bytes check", magicMatches("r.xlsx", xlsx.slice(0, 16)));
  const xt = await extractDataText("r.xlsx", xlsx);
  check("Excel becomes CSV-style text per sheet", xt?.startsWith('Sheet "Responses" (3 rows):') === true && (xt ?? "").includes("1,4,5,\"Good, quiet\""), xt);
  check("quotes in a cell are escaped", (xt ?? "").includes('"Said ""slow"""'));
  check("an empty sheet adds nothing", !(xt ?? "").includes("Empty"));
  check("CSV text is read, BOM dropped", (await extractDataText("a.csv", enc("﻿Q1,Q2\r\n4,5"))) === "Q1,Q2\n4,5");
  check("a PDF is not extracted", (await extractDataText("a.pdf", enc("%PDF-1.4"))) === null);
  const capped = capText("line\n".repeat(20_000));
  check("text is capped per file and says how much was left", capped.length < MAX_EXTRACTED_CHARS + 60 && /more characters not included\]$/.test(capped));

  const doc = new jsPDF();
  for (let i = 1; i < 7; i++) doc.addPage();
  const pdf = new Uint8Array(doc.output("arraybuffer"));
  check("the PDF page count is read", roughPdfPages(pdf) === 7, roughPdfPages(pdf));
  check("a real PDF passes the first-bytes check", magicMatches("s.pdf", pdf.slice(0, 16)));
  check("no page objects = unknown, not zero", roughPdfPages(enc("%PDF-1.7 nothing here")) === null);

  // ─── The chapter calls with the data attached ────────────────────────────
  const att: AttachmentBlock[] = [
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: "JVBERi0=" }, title: "spss.pdf" },
    { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw==" } },
  ];
  const breakpoints = (blocks: UserBlock[]) => blocks.filter((b) => b.cache_control).length + 1; // + the system block
  const outline = outlineUserBlocks("BRIEF", 4, att);
  check("plan call: brief, then the attachments, then the instruction", outline[0].type === "text" && outline[1].type === "document" && outline[2].type === "image" && outline[3].type === "text");
  check("plan call: only the last attachment is a cache point", !outline[1].cache_control && Boolean(outline[2].cache_control));
  check("plan call: at most 4 cache breakpoints", breakpoints(outline) <= 4, breakpoints(outline));
  check("plan call: no attachments, same blocks as before", outlineUserBlocks("BRIEF", 4).length === 2);

  const plan = buildPlan([
    { number: "4.1", heading: "Demographics", targetWords: 1500, subsections: [] },
    { number: "4.2", heading: "Reliability", targetWords: 1500, subsections: [] },
    { number: "4.3", heading: "Hypothesis tests", targetWords: 1500, subsections: [] },
  ]);
  const p0 = partUserBlocks({ briefText: "BRIEF", plan, partialOutput: null, chapter: 4, partIndex: 0, attachments: att });
  const lengths = plan.parts.map(() => 10);
  const written = ["[H1] CHAPTER FOUR\n\n[H2] 4.1 Demographics\n\nA", "[H2] 4.2 Reliability\n\nB"].join("\n\n");
  plan.parts[0].chars = written.split("\n\n[H2] 4.2")[0].length;
  const p2 = partUserBlocks({ briefText: "BRIEF", plan, partialOutput: written, chapter: 4, partIndex: Math.min(2, plan.parts.length - 1), attachments: att });
  check("writing call: attachments right after the brief", p0[1].type === "document" && p0[2].type === "image");
  check("writing call, first part: at most 4 cache breakpoints", breakpoints(p0) <= 4, breakpoints(p0));
  check("writing call, later part: at most 4 cache breakpoints", breakpoints(p2) <= 4, { bp: breakpoints(p2), lengths });
  check("the attachments are not changed in place", !att[1].cache_control);
}

main()
  .then(() => {
    if (failures.length) {
      console.error(`check:dataform — ${failures.length} failed, ${passed} passed`);
      for (const f of failures) console.error("  FAIL", f);
      process.exit(1);
    }
    console.log(`check:dataform — all ${passed} checks passed`);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
