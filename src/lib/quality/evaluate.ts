/**
 * The quality gate's core, without the database or Claude: build the Word
 * file, run the free layers, and (once the AI results are in) score all 89
 * checks. The gate (src/lib/quality-gate.ts) and `npm run check:quality` both
 * run exactly this.
 */

import { packChapter, packReport, profileFor, type AssemblyInput, type AssemblyReport } from "@/lib/assembly/assemble";
import type { SectionKey } from "@/lib/generation/department-map";
import { matchCitations, referenceCheck, type CitationMatch, type GateReference, type PrimarySourceRef, type SupportResult } from "./citation-check";
import { readDoc, readDocxParts, runFormattingChecks, type DocxParts } from "./formatting-checks";
import { prelimProse, proseParagraphs, type ProseParagraph } from "./prose";
import { writtenBlanks } from "@/lib/assembly/text-rules";
import { countWords } from "@/lib/generation/chapter-plan";
import { scoreQuality, type QualityScore } from "./score";
import { runStructuralChecks, type ChapterScope, type TraceabilityResult } from "./structural-checks";
import type { CheckResult, QualityIssue } from "./types";
import { mergeVoiceFindings, scanVoice, voiceCheck, type VoiceFinding } from "./voice-scan";

export interface PreparedReport {
  input: AssemblyInput;
  buffer: Uint8Array;
  report: AssemblyReport;
  parts: DocxParts;
  formatting: CheckResult[];
  match: CitationMatch;
  paragraphs: ProseParagraph[];
  scan: VoiceFinding[];
  template: "A" | "B";
}

export async function prepareReport(args: {
  input: AssemblyInput;
  references: GateReference[];
  knownCommon: (author: string, year: string) => { work: string } | null;
  primarySources?: PrimarySourceRef[];
  /**
   * The chapter gate: build and check ONE chapter's own Word file (the file the specialist and the
   * client download) instead of the whole report. The input must hold that chapter only, without
   * preliminary pages.
   */
  chapter?: { number: number; sourceHash: string };
}): Promise<PreparedReport> {
  const { input } = args;
  if (args.chapter && (input.includePrelims || input.chapters.length !== 1 || input.chapters[0].number !== args.chapter.number)) {
    throw new Error("The chapter gate checks one chapter, without preliminary pages.");
  }
  const { buffer, report } = args.chapter ? await packChapter(input, args.chapter.number, { sourceHash: args.chapter.sourceHash }) : await packReport(input);
  const parts = await readDocxParts(buffer);
  const formatting = runFormattingChecks(parts, { input, report, profile: profileFor(input), knownCommon: args.knownCommon, chapterScope: Boolean(args.chapter) });
  const template: "A" | "B" = templateFor(input.section);
  // Every Template B report uses a note-style placement (MODE_B or MODE_C); Template A uses in-text
  // (Author, Year), except Chicago notes-bibliography which the intake sets to MODE_C. The gate reads
  // it from the assembled report to stay in step with what the assembler actually produced.
  const noteStyle = noteStyleFor(input);
  const match = matchCitations({ chapters: input.chapters, references: args.references, mode: input.mode, knownCommon: args.knownCommon, primarySources: args.primarySources, noteStyle, placement: input.citationPlacement });
  const paragraphs = proseParagraphs(input.chapters);
  // D7b: the phrase scan also reads the acknowledgement and the abstract (the AI voice review stays per chapter).
  const prelimScan = input.includePrelims ? prelimProse(input.preliminary).flatMap((page) => scanVoice(page).filter((f) => f.rule !== "thin")) : [];
  return { input, buffer, report, parts, formatting, match, paragraphs, scan: [...scanVoice(paragraphs), ...prelimScan], template };
}

/** The report cites by note (Template B, or a MODE_A/B/C placement), not by (Author, Year). */
export function noteStyleFor(input: Pick<AssemblyInput, "section" | "citationPlacement">): boolean {
  return templateFor(input.section) === "B" || input.citationPlacement === "MODE_A" || input.citationPlacement === "MODE_B" || input.citationPlacement === "MODE_C";
}

/** Template B (thematic chapters): Humanities and doctrinal Law. */
export function templateFor(section: SectionKey | null): "A" | "B" {
  return section === "HUMANITIES" || section === "LAW_DOCTRINAL" ? "B" : "A";
}

export interface AiResults {
  voice: VoiceFinding[];
  voiceNotes: { chapter: number; readsHuman: boolean | null; note: string | null }[];
  support: { results: SupportResult[]; checked: number; total: number };
  traceability: TraceabilityResult | null;
  /** Calls that failed; each becomes a WARN on its layer. */
  errors: string[];
}

export function finishReport(
  prepared: PreparedReport,
  ai: AiResults,
  context: {
    /** The approved aim (null only on a report approved before aims were asked for). */
    aim?: string | null;
    objectives: string[];
    pureScience: boolean;
    supervisorToc: boolean;
    plans: Map<number, { targetWords: number; sections: { number: string; heading: string }[] } | null>;
    /** The chapter gate: the one chapter under check (null or absent for the whole report). */
    scope?: ChapterScope | null;
  },
): { checks: CheckResult[]; score: QualityScore } {
  const { input, match, report, parts } = prepared;
  const warn = (message: string): QualityIssue => ({ level: "WARN", message });

  const voice = voiceCheck(mergeVoiceFindings(prepared.scan, ai.voice), ai.voiceNotes);
  voice.issues.push(...ai.errors.filter((e) => e.startsWith("Voice")).map((e) => warn(`${e} The phrase scan still ran.`)));
  const reference = referenceCheck(match, ai.support, { minAgainst: context.scope ? 2 : 1 });
  reference.issues.push(...ai.errors.filter((e) => e.startsWith("Citation")).map((e) => warn(`${e} Citation matching still ran.`)));
  for (const c of [voice, reference]) if (c.status === "PASS" && c.issues.some((i) => i.level === "WARN")) c.status = "WARN";

  const doc = readDoc(parts);
  const firstText = doc.outside.find((p) => p.text.trim())?.text.trim() ?? "";
  const structural = runStructuralChecks({
    chapters: input.chapters.map((c) => ({ ...c, plan: context.plans.get(c.number) ?? null })),
    chapterBased: !input.includePrelims,
    section: input.section,
    mode: input.mode,
    pureScience: context.pureScience,
    template: prepared.template,
    thematicTitles: input.thematicTitles,
    aim: context.aim ?? null,
    objectives: context.objectives,
    supervisorToc: context.supervisorToc,
    prelims: {
      included: input.includePrelims,
      hasCover: input.includePrelims && firstText === input.title.toUpperCase(),
      hasTitlePage: doc.outside.some((p) => p.text.trim() === "BY") && doc.outside.some((p) => /^A PROJECT SUBMITTED/.test(p.text.trim())),
      heading1: doc.heading1,
      placeholders: report.prelimPlaceholders,
      written:
        input.includePrelims && input.preliminary
          ? {
              needsReview: input.preliminary.needsReview,
              abstractWords: countWords(input.preliminary.abstract),
              blanks: writtenBlanks(input.preliminary.acknowledgement, input.preliminary.abstract),
            }
          : null,
    },
    citations: match,
    traceability: ai.traceability,
    scope: context.scope ?? null,
  });
  const checks = [...prepared.formatting, voice, reference, ...structural];
  return { checks, score: scoreQuality(checks) };
}
