/**
 * Phase D4 checks — the client's data upload at a pause, with no database and
 * no Claude call: who may upload data files (canUpload edge cases), the frozen
 * delivery countdown and progress wording, which orders mean raw data, the
 * chapter attachment limits, the pause clock, the upload body limits, the
 * guard against a second "waiting for client" pause, and the client wording.
 *
 *   npm run check:dataupload
 */
import { canUpload, maxBytesFor, type UploaderRole, type UploadPurpose } from "../src/lib/files/policy";
import { clientPauseState, clientProgress, DATA_PAUSE_TEXT, deliveryCountdown, type ProgressInput } from "../src/lib/client-progress";
import { DATA_PAUSE_CLIENT_TEXT } from "../src/lib/client-updates";
import { checkChapterAttachments, MAX_ATTACHED_BYTES, MAX_SUBMITTED_FILES, ordersDataAnalysis, formatsFor } from "../src/lib/generation/dynamic-data-form";
import { pausedDaysBetween, shiftedDeadlines } from "../src/lib/pause-clock";
import { allowedTransitions, DATA_PAUSE_OVERLAP_MESSAGE, type TransitionCandidate } from "../src/lib/pipeline";
import { clientDataUploadSchema, pauseActionSchema, workerPauseActionSchema } from "../src/lib/validations/data-pause";
import { cleanValue, COUNT_VALUE_TEXT, fillValueSlots, findValueSlots, prefillValues } from "../src/lib/generation/count-placeholders";
import { LOADER_TEXT } from "../src/lib/generation/prompt-loader";

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else failures.push(`${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}

// ─── canUpload: the one narrow exception for clients ─────────────────────────
const cases: [UploaderRole, UploadPurpose, Parameters<typeof canUpload>[2], boolean, string][] = [
  ["CLIENT", "data", { ownsProject: true, activeDataPause: true }, true, "client, own project, active pause → data allowed"],
  ["CLIENT", "data", { ownsProject: true, activeDataPause: false }, false, "client, own project, no pause → refused"],
  ["CLIENT", "data", { ownsProject: false, activeDataPause: true }, false, "client, someone else's project with a pause → refused"],
  ["CLIENT", "data", {}, false, "client, nothing known → refused"],
  ["CLIENT", "data", undefined, false, "client, no context at all → refused"],
  ["CLIENT", "deliverable", { ownsProject: true, activeDataPause: true }, false, "client may never upload a chapter, even during a pause"],
  ["CLIENT", "message", {}, true, "client may attach files to messages"],
  ["WORKER", "data", {}, true, "worker may add data files"],
  ["WORKER", "deliverable", {}, true, "worker uploads chapters"],
  ["WORKER", "message", {}, false, "worker never writes in the client thread"],
  ["ADMIN", "data", {}, true, "admin may add data files"],
  ["ADMIN", "deliverable", {}, true, "admin uploads documents"],
  ["ADMIN", "message", {}, true, "admin attaches to messages"],
];
for (const [role, purpose, ctx, want, label] of cases) check(`canUpload: ${label}`, canUpload(role, purpose, ctx) === want);
check("data files are at most 25 MB each", maxBytesFor("data") === 25 * 1024 * 1024);

// ─── The delivery countdown ─────────────────────────────────────────────────
const due = new Date("2026-10-20T12:00:00Z");
const now = new Date("2026-10-10T12:00:00Z");
const base = { expectedDeliveryAt: due, deadlinePausedAt: null, status: "IN_PROGRESS" as const, now };
const running = deliveryCountdown(base);
check("no pause: the countdown runs", running.label === "10 days left" && running.date === due, running);
const waiting = deliveryCountdown({ ...base, dataPause: "waiting" });
check("waiting for files: 'Delivery date paused — waiting for your files'", waiting.label === "Delivery date paused — waiting for your files" && waiting.tone === "gold");
check("waiting for files: the date is still shown (it moves on afterwards)", waiting.date === due);
const checking = deliveryCountdown({ ...base, dataPause: "checking" });
check("files sent: paused while the specialist checks", checking.label === DATA_PAUSE_TEXT.countdownChecking && checking.label.includes("paused"));
check("a delivered project ignores a stale pause", deliveryCountdown({ ...base, status: "DELIVERED", dataPause: "waiting" }).label === "Delivered");
check("an unpaid project ignores a pause", deliveryCountdown({ ...base, status: "NEW", dataPause: "waiting" }).date === null);
check("no pause and no date: 'we'll confirm'", deliveryCountdown({ ...base, expectedDeliveryAt: null }).label.includes("confirm"));

// ─── The progress headline and the Writing step ─────────────────────────────
const input: ProgressInput = {
  status: "IN_PROGRESS",
  isProBono: false,
  downpaymentStatus: "Verified",
  balanceStatus: "Unpaid",
  research: "done",
  chapters: { ready: 2, total: 5 },
};
const plain = clientProgress(input);
check("no pause: the Writing step shows chapters ready", plain.steps.find((s) => s.key === "writing")?.detail === "2 of 5 chapters ready");
const paused = clientProgress({ ...input, dataPause: "waiting" });
check("waiting: headline asks for the data files", paused.headline === "We're waiting for your data files to continue." && paused.tone === "attention");
check("waiting: Writing step says 'Waiting for your data' instead of chapters", paused.steps.find((s) => s.key === "writing")?.detail === "Waiting for your data");
const beingChecked = clientProgress({ ...input, dataPause: "checking" });
check("checking: headline thanks them", beingChecked.headline === DATA_PAUSE_TEXT.headlineChecking && beingChecked.tone === "normal");
check("checking: Writing step says 'Checking your data'", beingChecked.steps.find((s) => s.key === "writing")?.detail === "Checking your data");
check("a pause does not change the percentage", paused.percent === plain.percent);
check("pause state: OPEN = waiting, SUBMITTED = checking, none = null", clientPauseState([{ status: "OPEN" }]) === "waiting" && clientPauseState([{ status: "SUBMITTED" }]) === "checking" && clientPauseState([]) === null);

// ─── Which orders mean raw data ─────────────────────────────────────────────
check("'With Data Analysis' option → raw data", ordersDataAnalysis({ serviceCode: "FYP-FULL", variantName: "With Data Analysis" }));
check("no option → the client's own analysis", !ordersDataAnalysis({ serviceCode: "FYP-FULL", variantName: null }));
check("DA combos → raw data", ["COMBO-PR-DA", "COMBO-RS-DA", "COMBO-PRDS"].every((c) => ordersDataAnalysis({ serviceCode: c })));
check("combos without DA → own analysis", ["COMBO-PR", "COMBO-RS", "COMBO-PFRS"].every((c) => !ordersDataAnalysis({ serviceCode: c })));
check("raw data may come as photos (paper questionnaires)", formatsFor(2, "RAW").includes("jpg") && !formatsFor(2, "ANALYSED").includes("jpg"));

// ─── What the chapters can carry ────────────────────────────────────────────
const MB = 1024 * 1024;
check("a small set fits", checkChapterAttachments([{ name: "spss.pdf", kind: "document", size: 2 * MB, pages: 20 }]).ok);
const bigImage = checkChapterAttachments([{ name: "photo.jpg", kind: "image", size: 6 * MB, pages: null }]);
check("an image over 5 MB is refused, named", !bigImage.ok && bigImage.problems[0].includes("photo.jpg"));
const longPdf = checkChapterAttachments([{ name: "all.pdf", kind: "document", size: 3 * MB, pages: 140 }]);
check("a PDF over 90 pages is refused, named", !longPdf.ok && longPdf.problems[0].includes("all.pdf") && longPdf.problems[0].includes("140"));
const tooMuch = checkChapterAttachments([
  { name: "a.pdf", kind: "document", size: 10 * MB, pages: 10 },
  { name: "b.pdf", kind: "document", size: 9 * MB, pages: 10 },
]);
check("over 18 MB in all is refused, naming the largest", !tooMuch.ok && tooMuch.problems.some((p) => p.includes("a.pdf")) && MAX_ATTACHED_BYTES === 18 * MB);
check("an unreadable page count is not held against the file", checkChapterAttachments([{ name: "x.pdf", kind: "document", size: MB, pages: null }]).ok);

// ─── The pause clock ────────────────────────────────────────────────────────
const t0 = new Date("2026-10-01T09:00:00Z");
check("days paused round up", pausedDaysBetween(t0, new Date("2026-10-03T10:00:00Z")) === 3);
check("no time paused → 0 days", pausedDaysBetween(t0, t0) === 0 && pausedDaysBetween(t0, new Date("2026-09-30T00:00:00Z")) === 0);
const shifted = shiftedDeadlines({ internalDeadline: new Date("2026-10-15T00:00:00Z"), expectedDeliveryAt: new Date("2026-10-20T00:00:00Z") }, 4);
check("both dates move on and the total grows", shifted.internalDeadline?.toISOString() === "2026-10-19T00:00:00.000Z" && shifted.expectedDeliveryAt?.toISOString() === "2026-10-24T00:00:00.000Z" && shifted.deadlinePausedDays?.increment === 4);
check("a missing date stays missing", !("expectedDeliveryAt" in shiftedDeadlines({ internalDeadline: null, expectedDeliveryAt: null }, 2)));
check("zero days changes nothing", Object.keys(shiftedDeadlines({ internalDeadline: t0, expectedDeliveryAt: t0 }, 0)).length === 0);

// ─── The upload body ────────────────────────────────────────────────────────
const ref = (i: number) => ({ pathname: `projects/cmabc12345/data/cmpause123/${String(i).padStart(24, "0")}.pdf`, ticket: "t".repeat(20), fileName: `f${i}.pdf` });
check("10 files are accepted", clientDataUploadSchema.safeParse({ pauseId: "cmpause123", files: Array.from({ length: 10 }, (_, i) => ref(i)) }).success && MAX_SUBMITTED_FILES === 10);
check("11 files are refused", !clientDataUploadSchema.safeParse({ pauseId: "cmpause123", files: Array.from({ length: 11 }, (_, i) => ref(i)) }).success);
check("no files is refused", !clientDataUploadSchema.safeParse({ pauseId: "cmpause123", files: [] }).success);
check("answers default to none", clientDataUploadSchema.safeParse({ pauseId: "cmpause123", files: [ref(1)] }).success);
check("the worker cannot cancel or open a pause", !workerPauseActionSchema.safeParse({ action: "cancel", pauseId: "cmpause123" }).success && !workerPauseActionSchema.safeParse({ action: "open", afterChapter: 3 }).success);
check("the founder/COO can", pauseActionSchema.safeParse({ action: "cancel", pauseId: "cmpause123" }).success && pauseActionSchema.safeParse({ action: "verify", pauseId: "cmpause123", chapterFileIds: [] }).success);
check("a note over 1,000 characters is refused", !workerPauseActionSchema.safeParse({ action: "request_more", pauseId: "cmpause123", note: "x".repeat(1001) }).success);

// ─── No second pause on top of a data pause ─────────────────────────────────
const candidate: TransitionCandidate = {
  status: "IN_PROGRESS",
  workerId: "w",
  workerAccepted: true,
  downpaymentStatus: "Verified",
  balanceStatus: "Unpaid",
  qaStatus: null,
  projectTitle: "t",
  serviceId: "s",
  hasRequirementDetail: true,
  workerFileCount: 0,
};
const awaitRule = (c: TransitionCandidate) => allowedTransitions(c).find((r) => r.to === "AWAITING_CLIENT_INPUT");
check("no data pause: 'Pause for client input' is allowed", awaitRule(candidate)?.guard?.(candidate) == null);
const inPause = { ...candidate, activeDataPause: true };
check("during a data pause: it is refused", awaitRule(inPause)?.guard?.(inPause) === DATA_PAUSE_OVERLAP_MESSAGE);

// ─── Client wording ─────────────────────────────────────────────────────────
const BANNED = [/\bAI\b/, /\b(claude|anthropic)\b/i, /\bautomat/i, /\bQA\b/, /\brevisions?\b/i, /\bworkers?\b/i, /\binternal\b/i];
const clientText = [...Object.values(DATA_PAUSE_CLIENT_TEXT), ...Object.values(DATA_PAUSE_TEXT)];
for (const line of clientText) check(`client wording is clean: "${line.slice(0, 40)}…"`, !BANNED.some((re) => re.test(line)), line);
check("the notification says what the spec says", DATA_PAUSE_CLIENT_TEXT.requestTitle === "EduCraft needs your data files" && DATA_PAUSE_CLIENT_TEXT.requestBody.startsWith("Your specialist has reached a point in your report"));

// ─── D11: the values a chapter before the pause left blank, filled in at Verify ───
{
  const ch3 = [
    "[H1] CHAPTER THREE",
    "[H2] 3.4 Sample and Sampling Technique",
    "A total of [N_DISTRIBUTED] questionnaires were distributed, of which [N_RETURNED] were retrieved, giving a response rate of [RESPONSE_RATE].",
    "The study population is [POPULATION_SIZE] registered traders; fieldwork ran [FIELDWORK_PERIOD].",
    "Of those retrieved, [N_RETURNED] were screened and [N_USABLE] were usable. The instrument had [SPECIFIC VALUE TO BE SUPPLIED] items and a pilot of [SPECIFIC VALUE TO BE SUPPLIED] traders.",
  ].join("\n");
  const ch2 = "[H2] 2.1 Review\nNo blanks here, and [DATA NOT PROVIDED — COO TO REVIEW] is not a count blank.";
  const slots = findValueSlots([{ number: 3, text: ch3 }, { number: 2, text: ch2 }]);
  const keys = slots.map((s) => s.key);
  check("every loader placeholder is found", ["N_DISTRIBUTED", "N_RETURNED", "RESPONSE_RATE", "POPULATION_SIZE", "FIELDWORK_PERIOD", "N_USABLE"].every((k) => keys.includes(k)), keys);
  check("a named blank written twice is one slot with two places", slots.find((s) => s.key === "N_RETURNED")?.occurrences === 2);
  check("each [SPECIFIC VALUE TO BE SUPPLIED] is its own slot", keys.filter((k) => k.startsWith("SPECIFIC:3:")).length === 2, keys);
  check("other placeholders are not value slots", !keys.some((k) => /DATA NOT PROVIDED/.test(k)));
  check("the context shows where the value goes", slots.find((s) => s.key === "N_DISTRIBUTED")?.context.includes("A total of ____ questionnaires") === true, slots.find((s) => s.key === "N_DISTRIBUTED")?.context);
  check("every named slot has a plain label", slots.every((s) => s.label.length > 8 && !/[A-Z]_[A-Z]/.test(s.label)));

  const all = { N_DISTRIBUTED: "362", N_RETURNED: "341", RESPONSE_RATE: "94.2%", POPULATION_SIZE: "3,200", FIELDWORK_PERIOD: "4 March to 26 April 2024", N_USABLE: "329", "SPECIFIC:3:1": "28", "SPECIFIC:3:2": "30" };
  const filled = fillValueSlots([{ number: 3, text: ch3 }], all);
  const text = filled.chapters[0].text;
  check("filled: no count blank is left", filled.missing.length === 0 && !/\[(N_|RESPONSE_RATE|POPULATION_SIZE|SAMPLE_SIZE|FIELDWORK_PERIOD|SPECIFIC VALUE)/.test(text), text);
  check("filled: the values land in the sentences", text.includes("A total of 362 questionnaires were distributed, of which 341 were retrieved, giving a response rate of 94.2%.") && text.includes("had 28 items and a pilot of 30 traders"));
  check("filled: both places of a named blank get its value", (text.match(/341/g) ?? []).length === 2);
  check("filled: the chapter is marked changed", filled.chapters[0].changed);
  const partial = fillValueSlots([{ number: 3, text: ch3 }], { N_DISTRIBUTED: "362", N_RETURNED: "  " });
  check("a blank or whitespace value counts as missing", partial.missing.includes("N_RETURNED") && partial.missing.includes("RESPONSE_RATE"), partial.missing);
  check("a value with brackets can never make a placeholder", cleanValue("[N_USABLE] 12") === "N_USABLE 12" && cleanValue("a\nb") === "a b" && cleanValue("x".repeat(300)).length === 200);
  check("a chapter with nothing to fill is unchanged", fillValueSlots([{ number: 2, text: ch2 }], {}).chapters[0].changed === false && findValueSlots([{ number: 2, text: ch2 }]).length === 0);

  const fields = [
    { key: "questionnaires_distributed", label: "How many questionnaires did you distribute?", type: "number" },
    { key: "returned", label: "How many were returned?", type: "number" },
    { key: "population", label: "Population of the study (registered traders)", type: "number" },
    { key: "fieldwork", label: "Fieldwork period", type: "text" },
    { key: "software", label: "Which software did you use?", type: "text" },
  ];
  const pre = prefillValues(slots, fields, { questionnaires_distributed: 362, returned: "341", population: "3200", fieldwork: "March to April 2024", software: "SPSS 26" });
  const val = (k: string) => pre.find((s) => s.key === k)?.prefill;
  check("pre-filled from the answers that plainly ask for them", val("N_DISTRIBUTED") === "362" && val("N_RETURNED") === "341" && val("POPULATION_SIZE") === "3200" && val("FIELDWORK_PERIOD") === "March to April 2024", pre.map((s) => [s.key, s.prefill]));
  check("no response rate is worked out without the usable count", val("RESPONSE_RATE") === "", val("RESPONSE_RATE"));
  check("nothing is guessed where no question asks", val("N_USABLE") === "" && val("SPECIFIC:3:1") === "");
  const withUsable = prefillValues(slots, [...fields, { key: "n_usable", label: "How many questionnaires were usable for analysis?", type: "number" }], { questionnaires_distributed: 362, returned: "341", n_usable: 329 });
  check("the response rate is usable ÷ distributed × 100 (the chapter prompts' formula)", withUsable.find((s) => s.key === "RESPONSE_RATE")?.prefill === "90.9%", withUsable.find((s) => s.key === "RESPONSE_RATE")?.prefill);
  check("the loader states the same response-rate formula", /\[RESPONSE_RATE\] for the response rate: the number usable as a percentage of the number distributed/.test(LOADER_TEXT.countsBeforePause(2, 3)));

  const tableChapter = [
    "Table 3.1: Proportionate allocation of sample size across market strata",
    "| Market Stratum | Population Size (N_h) | **Sample Allocation (n_h)** |",
    "|---|---|---|",
    "| Balogun / Mile 12 | [SPECIFIC VALUE TO BE SUPPLIED] | [SPECIFIC VALUE TO BE SUPPLIED] |",
    "| Computer Village | [SPECIFIC VALUE TO BE SUPPLIED] | [N_USABLE] |",
    "The instrument had [SPECIFIC VALUE TO BE SUPPLIED] items.",
  ].join("\n");
  const ts = findValueSlots([{ number: 3, text: tableChapter }]);
  const slot = (k: string) => ts.find((s) => s.key === k);
  check("a table cell's blank is labelled by its column", slot("SPECIFIC:3:1")?.label === "Population Size (N_h)" && slot("SPECIFIC:3:2")?.label === "Sample Allocation (n_h)", ts.map((s) => [s.key, s.label]));
  check("a table cell's blank knows its row", slot("SPECIFIC:3:1")?.table?.row === "Balogun / Mile 12" && slot("SPECIFIC:3:3")?.table?.row === "Computer Village" && slot("SPECIFIC:3:3")?.label === "Population Size (N_h)");
  check("a named blank in a table keeps its meaning and gains its column", slot("N_USABLE")?.label === COUNT_VALUE_TEXT.labels.N_USABLE && slot("N_USABLE")?.table?.column === "Sample Allocation (n_h)");
  check("a blank outside a table has no table and a numbered label", slot("SPECIFIC:3:4")?.table === null && slot("SPECIFIC:3:4")?.label === "Other value 4 in Chapter 3");
  const tf = fillValueSlots([{ number: 3, text: tableChapter }], { "SPECIFIC:3:1": "1,610", "SPECIFIC:3:2": "166", "SPECIFIC:3:3": "440", N_USABLE: "44", "SPECIFIC:3:4": "28" });
  check("table cells are filled in their own places", tf.missing.length === 0 && tf.chapters[0].text.includes("| Balogun / Mile 12 | 1,610 | 166 |") && tf.chapters[0].text.includes("| Computer Village | 440 | 44 |") && tf.chapters[0].text.includes("had 28 items"), tf.chapters[0].text);
  const wordy = prefillValues(slots, [{ key: "n", label: "Questionnaires distributed", type: "text" }], { n: "about three hundred" });
  check("a count is only pre-filled from a number", wordy.find((s) => s.key === "N_DISTRIBUTED")?.prefill === "");

  check("the verify action carries the values", workerPauseActionSchema.safeParse({ action: "verify", pauseId: "pause_12345678", values: { N_DISTRIBUTED: "362" } }).success);
  const noValues = workerPauseActionSchema.safeParse({ action: "verify", pauseId: "pause_12345678" });
  check("values default to none (older callers still validate)", noValues.success && noValues.data.action === "verify" && Object.keys(noValues.data.values).length === 0);
  check("a value over 200 characters is refused", !workerPauseActionSchema.safeParse({ action: "verify", pauseId: "pause_12345678", values: { N_DISTRIBUTED: "x".repeat(201) } }).success);
  const loaderList = LOADER_TEXT.countsBeforePause(2, 3);
  check("every placeholder the loader asks for is one the step can fill", ["N_DISTRIBUTED", "N_RETURNED", "N_USABLE", "RESPONSE_RATE", "POPULATION_SIZE", "SAMPLE_SIZE", "FIELDWORK_PERIOD", "SPECIFIC VALUE TO BE SUPPLIED"].every((t) => loaderList.includes(`[${t}]`) && findValueSlots([{ number: 3, text: `[${t}]` }]).length === 1));
  check("the specialist's wording names the chapter", COUNT_VALUE_TEXT.heading([3]) === "Values Chapter 3 left for the client's data" && COUNT_VALUE_TEXT.explain([2, 3]).startsWith("Chapters 2 and 3 were written"));
}

if (failures.length) {
  console.error(`check:dataupload — ${failures.length} failed, ${passed} passed`);
  for (const f of failures) console.error("  FAIL", f);
  process.exit(1);
}
console.log(`check:dataupload — all ${passed} checks passed`);
