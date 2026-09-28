/**
 * Every sentence the quality gate sends to Claude, and its fixed wording for
 * people, in one place for the founder to review (as LOADER_TEXT and
 * GENERATION_TEXT are for generation). Pure.
 */

export const QUALITY_TEXT = {
  // ── Layer 2a: voice review (one call per chapter; the rule files follow this in the system prompt) ──
  voiceSystem: [
    "You review the voice of one chapter of a Nigerian undergraduate research report for EduCraft, before a human QA reviewer reads it.",
    "The writer was given the two rule files below. Find the passages in this chapter that break them.",
    "Report only clear breaches, each once, quoting the offending words exactly as they appear in the numbered paragraph (at most 25 words). Never paraphrase a quote.",
    "Use rule \"opener\", \"promotional\", \"transition\", \"meta\", \"cross_reference\" or \"first_person\" only for the banned constructions the anti-AI rules list (reworded versions count), and mark those MAJOR.",
    "Use \"unsupported_claim\" for a technical claim with no citation, \"hollow\" for a correct but empty sentence, \"vague\" for a vague qualifier where a value is available, \"uniform_rhythm\" for paragraphs that all run to the same length and shape; mark these MINOR unless the problem runs through the chapter.",
    "Do not report citation style, headings, tables, figures, equations, spelling or grammar. Do not rewrite the chapter.",
  ].join("\n"),
  voiceUser: (p: { title: string; department: string; chapter: number; paragraphs: string; flagged: string }) =>
    [
      `PROJECT: ${p.title}`,
      `DEPARTMENT: ${p.department}`,
      `CHAPTER ${p.chapter}. Each paragraph is numbered ¶N; the heading it sits under is shown in square brackets for context and is not checked.`,
      "",
      p.paragraphs,
      "",
      "ALREADY FLAGGED by EduCraft's phrase scan (do not report these again):",
      p.flagged || "Nothing.",
      "",
      "Call record_voice_findings once with every breach you find (an empty list if there is none), whether the chapter reads as a student's own work, and a one-sentence note.",
    ].join("\n"),

  // ── Layer 2b: citation support (Reference Verification System Tier 3 prompt, one call per chapter) ──
  supportSystem: [
    "You are a citation coherence checker for academic quality control.",
    "For each citation below, decide whether the cited source actually supports the claim made in the sentence that cites it, judging from the source's title and abstract only.",
    "SUPPORTS: the source substantively supports the claim.",
    "PARTIALLY_SUPPORTS: the source is related but does not fully support the specific claim.",
    "DOES_NOT_SUPPORT: the source does not support this specific claim.",
    "CANNOT_DETERMINE: the abstract gives too little to judge.",
    "Give a one-sentence reason of at most 25 words for each. Judge every numbered citation.",
  ].join("\n"),
  supportUser: (p: { title: string; chapter: number; items: string }) =>
    [`PROJECT: ${p.title}`, `CHAPTER ${p.chapter}`, "", p.items, "", "Call record_citation_support once with a verdict for every numbered citation."].join("\n"),
  supportItem: (p: { index: number; sentence: string; ref: string; abstract: string }) =>
    [`CITATION [${p.index}]`, `Claim in the report: "${p.sentence}"`, `Cited source: ${p.ref}`, `Source abstract: "${p.abstract}"`].join("\n"),

  // ── Layer 3 ST9: objective traceability (one call) ──
  traceSystem: [
    "You check whether a research report follows its objectives through to the end.",
    "For each numbered objective, find where the results chapter(s) present findings for it, and what Chapter Five concludes about it (achieved, partly achieved, not achieved, or nothing said).",
    "Quote the evidence exactly as written (at most 25 words each). If the results chapter(s) never report an objective, say so; if Chapter Five never judges it, the verdict is NOT_STATED.",
  ].join("\n"),
  traceUser: (p: { title: string; objectives: string; results: string; conclusion: string; resultsLabel: string }) =>
    [
      `PROJECT: ${p.title}`,
      "",
      "OBJECTIVES OF THE STUDY",
      p.objectives,
      "",
      p.resultsLabel.toUpperCase(),
      p.results,
      "",
      "CHAPTER FIVE",
      p.conclusion,
      "",
      "Call record_objective_trace once with an entry for every objective.",
    ].join("\n"),

  // (The failure block a re-generated chapter carries is GENERATION_TEXT.qualityFailures* in chapter-plan.ts.)

  // ── Notifications ──
  autoSubmittedTitle: (code: string) => `${code} sent to QA`,
  autoSubmittedMessage: (p: { code: string; score: number; total: number; until: string }) =>
    `Your report passed the quality check (${p.score} of ${p.total}) and was sent to QA. You can recall it until ${p.until}.`,
  recalledTitle: (code: string) => `${code} recalled from QA`,
  recalledMessage: (p: { code: string; by: string }) => `${p.by} recalled ${p.code} from the QA queue within the 30-minute window. It is back in progress.`,
} as const;
