/**
 * Phase D2 checks — chapter generation's pure parts, with no database and no
 * network: the Anthropic stream reader, retry rules, prices (cache included),
 * the brief, the plan, packing into parts, the cache layout of each call,
 * output tidying, progress and the progress events.
 *
 *   npm run check:generation
 */
import {
  AnthropicStreamAccumulator,
  StreamErrorEvent,
  isRetryableErrorType,
  isRetryableStatus,
  retryDelayMs,
} from "../src/lib/anthropic-stream";
import { costUsd } from "../src/lib/ai-pricing";
import {
  GENERATION_TEXT,
  MAX_PARTS,
  PLAN_TOOL,
  PlanError,
  buildChapterBrief,
  buildPlan,
  cleanPartText,
  computeProgress,
  countWords,
  joinParts,
  missingHeadings,
  nonAnswerReason,
  outlineUserBlocks,
  packParts,
  parsePlanInput,
  partInstruction,
  partMaxTokens,
  partUnits,
  partUserBlocks,
  planText,
  splitAgentReport,
  splitParts,
  stepEstimateMs,
  unitHeadingNumber,
  type PlanSection,
} from "../src/lib/generation/chapter-plan";
import { eventForSnapshot, formatSse, isStalled, snapshotKey, type SnapshotLike } from "../src/lib/generation/generation-events";

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else failures.push(`${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}
function throws(name: string, fn: () => unknown, kind?: new (...a: any[]) => Error) {
  try {
    fn();
    check(name, false, "did not throw");
  } catch (e) {
    check(name, kind ? e instanceof kind : true, e instanceof Error ? e.message : e);
  }
}
const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

// ─── The stream reader ──────────────────────────────────────────────────────
{
  const stream =
    sse("message_start", { type: "message_start", message: { id: "msg_1", model: "claude-sonnet-5", usage: { input_tokens: 1200, cache_creation_input_tokens: 30000, cache_read_input_tokens: 0, output_tokens: 3 } } }) +
    sse("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }) +
    sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "abc" } }) +
    sse("content_block_stop", { type: "content_block_stop", index: 0 }) +
    sse("ping", { type: "ping" }) +
    sse("content_block_start", { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }) +
    sse("content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "1.1 Background of the Study\n\n" } }) +
    sse("content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Mobile money has grown, “quickly”, in Lagos." } }) +
    sse("content_block_stop", { type: "content_block_stop", index: 1 }) +
    sse("content_block_start", { type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "tu_1", name: "record_chapter_plan", input: {} } }) +
    sse("content_block_delta", { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '{"sections": [{"number": "1.1",' } }) +
    sse("content_block_delta", { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: ' "heading": "Background"}]}' } }) +
    sse("content_block_stop", { type: "content_block_stop", index: 2 }) +
    sse("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 912 } }) +
    sse("message_stop", { type: "message_stop" });

  // Split at awkward places (mid-line, mid-UTF-8 is handled by TextDecoder upstream) and with CRLF line ends.
  const crlf = stream.replace(/\n/g, "\r\n");
  let streamed = "";
  const acc = new AnthropicStreamAccumulator((d) => (streamed += d));
  for (let i = 0; i < crlf.length; i += 37) acc.push(crlf.slice(i, i + 37));
  acc.flush();
  check("stream: text assembled", acc.text === "1.1 Background of the Study\n\nMobile money has grown, “quickly”, in Lagos.", acc.text);
  check("stream: onText saw every delta", streamed === acc.text);
  check("stream: model", acc.model === "claude-sonnet-5");
  check("stream: stop reason", acc.stopReason === "end_turn");
  check("stream: finished", acc.finished);
  check("stream: usage input side", acc.usage.inputTokens === 1200 && acc.usage.cacheWriteTokens === 30000 && acc.usage.cacheReadTokens === 0, acc.usage);
  check("stream: usage output is the final cumulative count", acc.usage.outputTokens === 912, acc.usage);
  check("stream: tool call parsed from input_json_delta pieces", acc.toolCalls.length === 1 && (acc.toolCalls[0].input as any)?.sections?.[0]?.heading === "Background", acc.toolCalls);

  const cut = new AnthropicStreamAccumulator();
  cut.push(stream.slice(0, stream.indexOf("event: message_delta")));
  check("stream: a stream that ends early is not finished", !cut.finished && cut.text.length > 0);
  check("stream: a cut-off stream estimates its output from the text", cut.estimateUnfinishedUsage() && cut.usage.outputTokens === Math.ceil(cut.text.length / 3), cut.usage);
  check("stream: a finished stream keeps the real count", !acc.estimateUnfinishedUsage() && acc.usage.outputTokens === 912);

  const errored = new AnthropicStreamAccumulator();
  let caught: unknown = null;
  try {
    errored.push(sse("message_start", { type: "message_start", message: { model: "claude-sonnet-5", usage: { input_tokens: 10 } } }));
    errored.push(sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Half a sen" } }));
    errored.push(sse("error", { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }));
  } catch (e) {
    caught = e;
  }
  check("stream: an error event throws StreamErrorEvent", caught instanceof StreamErrorEvent && (caught as StreamErrorEvent).type === "overloaded_error");
  check("stream: text before the error is kept", errored.text === "Half a sen");

  const badJson = new AnthropicStreamAccumulator();
  badJson.push(sse("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "tool_use", name: "record_chapter_plan" } }));
  badJson.push(sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"sections": [' } }));
  badJson.push(sse("content_block_stop", { type: "content_block_stop", index: 0 }));
  check("stream: unparseable tool JSON gives input null (not a crash)", badJson.toolCalls[0]?.input === null);
}

// ─── Retry rules ────────────────────────────────────────────────────────────
check("retry: 429, 529, 500, 503 are retried", [429, 529, 500, 503].every(isRetryableStatus));
check("retry: 400, 401, 403, 404, 413 are not", ![400, 401, 403, 404, 413].some(isRetryableStatus));
check("retry: overloaded_error / api_error retried, invalid_request_error not", isRetryableErrorType("overloaded_error") && isRetryableErrorType("api_error") && !isRetryableErrorType("invalid_request_error"));
check("retry: retry-after header wins", retryDelayMs(1, "7") === 7000);
check("retry: backoff doubles (no jitter)", retryDelayMs(1, null, 30_000, 0.5) === 2000 && retryDelayMs(3, null, 30_000, 0.5) === 8000);
check("retry: capped", retryDelayMs(10, null, 30_000, 0.5) === 30_000 && retryDelayMs(1, "600") === 30_000);

// ─── Prices ─────────────────────────────────────────────────────────────────
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
check("price: 1M uncached input = $2", near(costUsd("claude-sonnet-5", 1_000_000, 0), 2));
check("price: 1M output = $10", near(costUsd("claude-sonnet-5", 0, 1_000_000), 10));
check("price: 1M cache writes = $2.50 (1.25x)", near(costUsd("claude-sonnet-5", 0, 0, 0, { writeTokens: 1_000_000 }), 2.5));
check("price: 1M cache reads = $0.20 (0.1x)", near(costUsd("claude-sonnet-5", 0, 0, 0, { readTokens: 1_000_000 }), 0.2));
check("price: 1,000 web searches = $10", near(costUsd("claude-sonnet-5", 0, 0, 1000), 10));
check("price: unknown model falls back to the Sonnet rate", near(costUsd("claude-unknown", 1_000_000, 0), 2));

// ─── The brief ──────────────────────────────────────────────────────────────
const brief = buildChapterBrief({
  chapter: 3,
  projectTitle: "  Mobile money adoption among small businesses in Lagos ",
  university: "University of Lagos",
  department: "Business Administration",
  template: "A",
  objectives: ["examine adoption levels", " identify barriers "],
  researchQuestions: ["What is the level of adoption?"],
  specialInstructions: null,
  supervisorToc: "",
});
check("brief: title trimmed", brief.includes("Project title: Mobile money adoption among small businesses in Lagos\n"));
check("brief: chapter N of 5", brief.includes("This is Chapter 3 of 5. Write Chapter 3 only."));
check("brief: objectives numbered and trimmed", brief.includes("1. examine adoption levels\n2. identify barriers"));
check("brief: objectives rule", brief.includes(GENERATION_TEXT.objectivesRule));
check("brief: research questions", brief.includes("1. What is the level of adoption?") && brief.includes(GENERATION_TEXT.questionsRule));
check("brief: no hypotheses section when none", !brief.includes("Hypotheses:"));
check("brief: TOC and instructions defaults", brief.includes(GENERATION_TEXT.noToc) && brief.includes(`Special instructions from the client:\n${GENERATION_TEXT.noInstructions}`));
check("brief: output format included", brief.includes("OUTPUT FORMAT") && brief.includes("Do not write the report's References list"));
check("brief: headings follow the prompts' own AI AGENT OUTPUT FORMAT markers", brief.includes("AI AGENT OUTPUT FORMAT") && brief.includes("[H2] 2.1 Introduction") && brief.includes("[AGENT REPORT]"));
check("brief: Template A has no thematic titles", !brief.includes("Chapter 3 title:"));
const briefB = buildChapterBrief({
  chapter: 1,
  projectTitle: "T",
  university: "U",
  department: "History",
  template: "B",
  thematicTitles: { chapter3: "Colonial trade routes", chapter4: " " },
  objectives: ["o"],
});
check("brief: Template B lists the thematic titles given", briefB.includes("Chapter 3 title: Colonial trade routes") && !briefB.includes("Chapter 4 title:"));

// ─── The plan ───────────────────────────────────────────────────────────────
const rawPlan = {
  sections: [
    { number: "1.1", heading: "1.1 Background of the Study", subsections: ["1.1.1 Mobile money in Nigeria"], targetWords: 900 },
    { number: "1.2", heading: "Statement of the Problem", subsections: [], targetWords: 500 },
    { number: "1.3", heading: "Objectives of the Study", subsections: [], targetWords: 600 },
    { number: "1.4", heading: "Significance of the Study", targetWords: "2500" },
    { number: "1.5", heading: "Scope of the Study", subsections: [], targetWords: 300 },
    { number: "1.6", heading: "Definition of Terms", subsections: [], targetWords: 200 },
  ],
};
const sections = parsePlanInput(rawPlan, 1);
check("plan: parsed", sections.length === 6);
check("plan: heading number stripped", sections[0].heading === "Background of the Study", sections[0].heading);
check("plan: subsections default to []", Array.isArray(sections[3].subsections) && sections[3].subsections.length === 0);
check("plan: word target coerced from a string", sections[3].targetWords === 2500);
throws("plan: sections of another chapter refused", () => parsePlanInput({ sections: [{ number: "2.1", heading: "Intro", subsections: [], targetWords: 2000 }] }, 1), PlanError);
throws("plan: a duplicated number refused", () => parsePlanInput({ sections: [rawPlan.sections[1], rawPlan.sections[1], rawPlan.sections[2]] }, 1), PlanError);
throws("plan: a chapter of 300 words refused", () => parsePlanInput({ sections: [{ number: "1.1", heading: "Short", subsections: [], targetWords: 300 }] }, 1), PlanError);
throws("plan: no sections refused", () => parsePlanInput({ sections: [] }, 1), PlanError);
throws("plan: not an object refused", () => parsePlanInput(null, 1), PlanError);

const parts = packParts(sections);
check("pack: 3 parts (900+500+600 | 2500 | 300+200)", parts.length === 3 && parts[0].sections.join() === "1.1,1.2,1.3" && parts[1].sections.join() === "1.4" && parts[2].sections.join() === "1.5,1.6", parts);
check("pack: part targets", parts.map((p) => p.targetWords).join() === "2000,2500,500");
check("pack: indexes in order", parts.every((p, i) => p.index === i));
const many: PlanSection[] = Array.from({ length: 30 }, (_, i) => ({ number: `2.${i + 1}`, heading: `S${i}`, subsections: [], targetWords: 800 }));
const manyParts = packParts(many);
check("pack: 30 sections of 800 words = 15 parts of two", manyParts.length === 15 && manyParts.every((p) => p.targetWords === 1600), manyParts.length);
check("pack: every section in exactly one part, in order", manyParts.flatMap((p) => p.sections).join() === many.map((s) => s.number).join());
const tooMany: PlanSection[] = Array.from({ length: 17 }, (_, i) => ({ number: `2.${i + 1}`, heading: `S${i}`, subsections: [], targetWords: 1100 }));
throws(`plan: more than ${MAX_PARTS} parts refused`, () => buildPlan(tooMany), PlanError);

// A long section is split across parts by its sub-sections, so no call writes much more than 2,000 words.
const longSections = parsePlanInput(
  {
    sections: [
      { number: "2.1", heading: "Introduction", subsections: [], targetWords: 300 },
      { number: "2.4", heading: "Empirical Review", subsections: ["2.4.1 Adoption studies", "2.4.2 Performance studies", "Barriers studies", "2.4.4 Nigerian evidence", "2.4.5 Other African evidence", "2.4.6 Synthesis"], targetWords: 4500 },
      { number: "2.5", heading: "Research Gap", subsections: [], targetWords: 600 },
    ],
  },
  2,
);
check("plan: an unnumbered sub-section is numbered in place", longSections[1].subsections[2] === "2.4.3 Barriers studies", longSections[1].subsections);
const longPlan = buildPlan(longSections);
const unitsOf = (i: number) => (longPlan.parts[i].units ?? []).map((u) => `${u.section}[${u.subFrom ?? "-"},${u.subTo ?? "-"})=${u.targetWords}`).join(" ");
check("split: 4,500 words in 6 sub-sections = three runs of 1,500", longPlan.parts.flatMap((p) => p.units ?? []).filter((u) => u.section === "2.4").map((u) => `${u.subFrom}-${u.subTo}:${u.targetWords}`).join() === "0-2:1500,2-4:1500,4-6:1500", longPlan.parts.map((_, i) => unitsOf(i)));
check("split: no part over 2,000 words", longPlan.parts.every((p) => p.targetWords <= 2000), longPlan.parts.map((p) => p.targetWords));
check("split: the introduction shares a part with the first run", unitsOf(0) === "2.1[-,-)=300 2.4[0,2)=1500", unitsOf(0));
const ins0 = partInstruction(longPlan, 0, 2);
const ins1 = partInstruction(longPlan, 1, 2);
const ins2 = partInstruction(longPlan, 2, 2);
check("split: the first run writes the section opening and stops at a sub-section", ins0.includes("2.4 Empirical Review: its opening and sub-sections 2.4.1 Adoption studies; 2.4.2 Performance studies (about 1500 words); the rest of 2.4 comes in the next part") && ins0.includes("Stop when sub-section 2.4.2 is complete"), ins0);
check("split: a continued run starts at its [H3] sub-section", ins1.includes('Begin with the heading "[H3] 2.4.3 Barriers studies"') && ins1.includes("2.4 Empirical Review, continued: sub-sections 2.4.3 Barriers studies; 2.4.4 Nigerian evidence") && ins1.includes("Stop when sub-section 2.4.4 is complete"), ins1);
check("split: the last run ends the section and stops at the section, not a sub-section", ins2.includes("2.4 Empirical Review, continued: sub-sections 2.4.5 Other African evidence; 2.4.6 Synthesis (about 1500 words), which end the section") && ins2.includes("Stop when section 2.4 is complete"), ins2);
check("split: the heading a continued run must contain is its first sub-section", unitHeadingNumber(longPlan, longPlan.parts[1].units![0]) === "2.4.3" && unitHeadingNumber(longPlan, longPlan.parts[0].units![0]) === "2.1");
check("split: an old plan without units still reads as whole sections", partUnits(buildPlan(sections), { index: 0, sections: ["1.1", "1.2"], targetWords: 1400 }).map((u) => u.section).join() === "1.1,1.2");
throws("plan: a 3,000-word section with no sub-sections is sent back", () => parsePlanInput({ sections: [{ number: "2.1", heading: "Everything", subsections: ["2.1.1 Only one"], targetWords: 3000 }] }, 2), PlanError);
check("estimate: planning 60 s, a 2,000-word part 160 s", stepEstimateMs({ kind: "plan" }) === 60_000 && stepEstimateMs({ kind: "part", targetWords: 2000 }) === 160_000);

const plan = buildPlan(sections);
check("plan: target words summed", plan.targetWords === 5000);
const pText = planText(plan);
check("plan text: headings and targets", pText.includes("1.1 Background of the Study, about 900 words") && pText.includes("    1.1.1 Mobile money in Nigeria") && pText.includes("Total: about 5,000 words."));

const i0 = partInstruction(plan, 0, 1);
const i1 = partInstruction(plan, 1, 1);
const i2 = partInstruction(plan, 2, 1);
check("part 1: header, sections, [H1] lines then the first [H2] heading", i0.startsWith("WRITE PART 1 OF 3") && i0.includes('Begin with the two [H1] chapter lines, then the heading "[H2] 1.1 Background of the Study"') && i0.includes("1.2 Statement of the Problem (about 500 words)"), i0);
check("parts: every call says reply with the chapter text only", [i0, i1, i2].every((i) => i.includes(GENERATION_TEXT.replyWithText)));
check("part 2: starts at its [H2] heading, no repeated [H1] lines", i1.includes('Begin with the heading "[H2] 1.4 Significance of the Study"') && i1.includes("do not repeat the [H1] chapter lines"));
check("part 1: sub-sections named", i0.includes("sub-sections: 1.1.1 Mobile money in Nigeria"));
check("part 1: no 'continue' line, stops at 1.3", !i0.includes("Continue from the text") && i0.includes("Stop when section 1.3 is complete. Do not begin anything later in the plan"));
check("part 2: continues from the text above", i1.includes("Continue from the text already written above"));
check("part 3: marked as the last part, with the agent report", i2.includes("This is the last part of the chapter. Stop when section 1.6 is complete, then add the [AGENT REPORT]"));
check("max tokens: 2,000 words -> 21,000", partMaxTokens(2000) === 21_000, partMaxTokens(2000));
check("max tokens: raised by half on each retry", partMaxTokens(2000, 1) === 31_500);
check("max tokens: capped at 64,000", partMaxTokens(9000, 3) === 64_000);
check("plan tool: required fields", JSON.stringify(PLAN_TOOL.input_schema.properties.sections.items.required) === '["number","heading","subsections","targetWords"]');

// ─── Cache layout ───────────────────────────────────────────────────────────
const outlineBlocks = outlineUserBlocks("BRIEF", 1);
check("cache: planning call caches the brief, not the instruction", outlineBlocks.length === 2 && !!outlineBlocks[0].cache_control && !outlineBlocks[1].cache_control);
const partTexts = ["1.1 Background of the Study\n\nText one.", "1.4 Significance of the Study\n\nText two."];
const donePlan = { ...plan, parts: plan.parts.map((p, i) => (i < 2 ? { ...p, done: true, chars: partTexts[i].length, words: countWords(partTexts[i]) } : p)) };
const b0 = partUserBlocks({ briefText: "BRIEF", plan, partialOutput: null, chapter: 1, partIndex: 0 });
const b2 = partUserBlocks({ briefText: "BRIEF", plan: donePlan, partialOutput: joinParts(partTexts), chapter: 1, partIndex: 2 });
const b1 = partUserBlocks({ briefText: "BRIEF", plan: donePlan, partialOutput: partTexts[0], chapter: 1, partIndex: 1 });
const marks = (bs: { cache_control?: unknown }[]) => bs.map((b) => (b.cache_control ? 1 : 0)).join("");
check("cache: part 1 = brief, plan*, instruction", marks(b0) === "010" && b0.length === 3, marks(b0));
check("cache: part 3 = brief, plan*, part1, part2*, instruction", marks(b2) === "01010" && b2.length === 5, marks(b2));
check("cache: at most 3 breakpoints with the system block (4 allowed)", 1 + marks(b2).split("").filter((c) => c === "1").length <= 4);
check("cache: part 2's written block is byte-identical inside part 3's request (prefix reuse)", b1[2].text === b2[2].text && b1[1].text === b2[1].text && b1[0].text === b2[0].text);
check("cache: written text is labelled once, on the first part", b2[2].text.startsWith(GENERATION_TEXT.writtenSoFar(1)) && !b2[3].text.startsWith("CHAPTER"));
const b2bad = partUserBlocks({ briefText: "BRIEF", plan: donePlan, partialOutput: joinParts(partTexts) + "x", chapter: 1, partIndex: 2 });
check("cache: lengths that do not add up fall back to one block", b2bad.length === 4);

// ─── Output ─────────────────────────────────────────────────────────────────
check("split/join round trip", JSON.stringify(splitParts(joinParts(partTexts), partTexts.map((t) => t.length))) === JSON.stringify(partTexts));
check("split: wrong lengths give null", splitParts("abc", [1, 1]) === null);
const firstPart = "[H1] CHAPTER ONE\n\n[H1] INTRODUCTION\n\n[H2] 1.1 Background\n\nText.";
check("clean: the first part keeps its [H1] chapter lines", cleanPartText(firstPart, 1, { first: true }) === firstPart);
check("clean: a later part drops repeated [H1] lines", cleanPartText(firstPart, 1, { first: false }) === "[H2] 1.1 Background\n\nText.");
check("clean: a later part drops a plain 'CHAPTER ONE' and the title under it", cleanPartText("CHAPTER ONE\nINTRODUCTION\n\n1.4 Significance\n\nText.", 1, { first: false }) === "1.4 Significance\n\nText.");
check("clean: a bold 'CHAPTER 1' line in a later part", cleanPartText("**CHAPTER 1**\n\n1.4 Significance", 1, { first: false }) === "1.4 Significance");
check("clean: leaves other text alone", cleanPartText("  [H2] 1.1 Background\r\n\r\nChapter one of this study argues…  ", 1, { first: false }) === "[H2] 1.1 Background\n\nChapter one of this study argues…");
check("clean: another chapter's title is not stripped", cleanPartText("CHAPTER TWO\n\n1.1 x", 1, { first: false }).startsWith("CHAPTER TWO"));
check("headings: missing ones found, with or without markers", missingHeadings("[H2] 1.1 Background\n\ntext\n\n1.2. Problem\n\n[H3] 1.2.1 Sub\n\ntext", ["1.1", "1.2", "1.2.1", "1.3"]).join() === "1.3");
const report = splitAgentReport("[H2] 4.5 Summary\n\nText.\n\n[AGENT REPORT]\nCHAPTER FOUR COMPLETE: yes\nFLAGS: none");
check("report: split off the text", report.body.trim() === "[H2] 4.5 Summary\n\nText." && report.report === "CHAPTER FOUR COMPLETE: yes\nFLAGS: none", report);
check("report: none when absent", splitAgentReport("Text.").report === null && splitAgentReport("Text.").body === "Text.");
const realPart = "[H2] 2.1 Introduction\n\n" + "word ".repeat(400);
check("answer: a real part passes", nonAnswerReason(realPart, { firstHeading: "2.1", targetWords: 1600 }) === null);
check("answer: a short note fails", /fewer than the 400/.test(nonAnswerReason("I will now write sections 2.1 and 2.2 as instructed.", { firstHeading: "2.1", targetWords: 1600 }) ?? ""));
check("answer: a long reply without the first heading fails", /the heading 2.1/.test(nonAnswerReason("word ".repeat(500), { firstHeading: "2.1", targetWords: 1600 }) ?? ""));
check("answer: small parts still need 50 words", /fewer than the 50/.test(nonAnswerReason("[H2] 1.8 Definition of Terms\n\nShort.", { firstHeading: "1.8", targetWords: 100 }) ?? ""));
check("headings: a number inside a sentence does not count", missingHeadings("See section 1.3 below.", ["1.3"]).join() === "1.3");
check("words: counted", countWords("Mobile money's growth, in 2024, was 3.5 times — faster.") === 9, countWords("Mobile money's growth, in 2024, was 3.5 times — faster."));
check("words: empty", countWords("") === 0 && countWords(null) === 0);

// ─── Progress ───────────────────────────────────────────────────────────────
check("progress: pending 0, planning 2", computeProgress({ status: "PENDING", previous: 0 }) === 0 && computeProgress({ status: "OUTLINING", previous: 0 }) === 2);
check("progress: planned = 5", computeProgress({ status: "WRITING", previous: 2, targetWords: 5000, wordsWritten: 0 }) === 5);
check("progress: half the words = 50", computeProgress({ status: "WRITING", previous: 5, targetWords: 5000, wordsWritten: 2500 }) === 50);
check("progress: capped at 95 while writing", computeProgress({ status: "WRITING", previous: 5, targetWords: 5000, wordsWritten: 9000 }) === 95);
check("progress: never goes backwards", computeProgress({ status: "WRITING", previous: 60, targetWords: 5000, wordsWritten: 100 }) === 60);
check("progress: complete = 100, failed keeps its value", computeProgress({ status: "COMPLETED", previous: 40 }) === 100 && computeProgress({ status: "FAILED", previous: 40 }) === 40);

// ─── Events ─────────────────────────────────────────────────────────────────
const t0 = new Date("2026-09-26T12:00:00Z");
const snap = (over: Partial<SnapshotLike>): SnapshotLike => ({
  id: "cp1",
  chapterNumber: 2,
  status: "WRITING",
  progressPercent: 40,
  partCursor: 1,
  partCount: 4,
  failedSteps: 0,
  errorMessage: null,
  lastError: null,
  lockedUntil: null,
  lastStepAt: t0,
  createdAt: t0,
  updatedAt: t0,
  inputTokens: 1000,
  outputTokens: 5000,
  cacheWriteTokens: 30000,
  cacheReadTokens: 60000,
  costUsd: 0.2,
  ...over,
});
const progress = eventForSnapshot(snap({}), { nairaRate: 1500 });
check("event: chapter_progress fields", progress.event === "chapter_progress" && JSON.stringify(progress.data) === JSON.stringify({ chapterNum: 2, progressPercent: 40, status: "writing", part: 2, partCount: 4 }), progress.data);
const retrying = eventForSnapshot(snap({ failedSteps: 1, lastError: "Overloaded" }), { nairaRate: 1500 });
check("event: a retry is reported", (retrying.data.retrying as any)?.attempt === 2 && (retrying.data.retrying as any)?.lastError === "Overloaded");
const planning = eventForSnapshot(snap({ status: "OUTLINING", partCount: 0, partCursor: 0, progressPercent: 2 }), { nairaRate: 1500 });
check("event: planning has part 0 of 0", planning.data.status === "outlining" && planning.data.part === 0);
const complete = eventForSnapshot(snap({ status: "COMPLETED", progressPercent: 100, partCursor: 4 }), { nairaRate: 1500, output: { outputLength: 41000, words: 6100 } });
check("event: chapter_complete fields", complete.event === "chapter_complete" && complete.data.chapterNum === 2 && complete.data.outputLength === 41000 && complete.data.tokensUsed === 96000 && complete.data.costNaira === 300, complete.data);
const failed = eventForSnapshot(snap({ status: "FAILED", errorMessage: "Simulated failure", partCursor: 1 }), { nairaRate: 1500 });
check("event: chapter_failed fields", failed.event === "chapter_failed" && failed.data.error === "Simulated failure" && failed.data.partsWritten === 1, failed.data);
const frame = formatSse(failed);
check("sse: frame format", /^id: cp1:\d+\nevent: chapter_failed\ndata: \{.*\}\n\n$/.test(frame), frame);
check("sse: key changes with progress, not with time", snapshotKey(snap({})) !== snapshotKey(snap({ progressPercent: 41 })) && snapshotKey(snap({})) === snapshotKey(snap({ updatedAt: new Date() })));
const now = t0.getTime() + 120_000;
check("stall: unlocked and quiet for 2 min = stalled", isStalled(snap({}), now));
check("stall: a live lease is not stalled", !isStalled(snap({ lockedUntil: new Date(now + 30_000) }), now));
check("stall: recent progress is not stalled", !isStalled(snap({ lastStepAt: new Date(now - 10_000) }), now));
check("stall: finished and failed runs are never stalled", !isStalled(snap({ status: "COMPLETED" }), now) && !isStalled(snap({ status: "FAILED" }), now));
check("stall: a pending run nobody picked up is stalled", isStalled(snap({ status: "PENDING", lastStepAt: null }), now));

// ─── Report ─────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`check:generation — ${failures.length} failed, ${passed} passed`);
  for (const f of failures) console.error("  FAIL", f);
  process.exit(1);
}
console.log(`check:generation — all ${passed} checks passed`);
