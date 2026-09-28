/**
 * Phase D8 Layer 2a: voice. A free phrase scan over the raw chapter text, then
 * (in the gate) one Claude call per chapter against anti_ai_rules.md and
 * voice_rules.md. The phrase tables copy prompts/shared/anti_ai_rules.md;
 * `npm run check:quality` fails if a bullet of §2.1, §2.2, §2.3 or §2.6 is
 * missing here, so the two cannot drift apart. Pure.
 */

import { normaliseForMatch, PRELIM_CHAPTER, splitSentences, type ProseParagraph } from "./prose";
import { result, shortQuote, type CheckResult, type QualityIssue } from "./types";

export type VoiceRule =
  | "opener"
  | "promotional"
  | "transition"
  | "meta"
  | "cross_reference"
  | "first_person"
  | "vague"
  | "weak_verb"
  | "thin"
  | "unsupported_claim"
  | "hollow"
  | "uniform_rhythm"
  | "other";

/** Literal banned constructions: a MAJOR one of these fails the voice check, whoever found it. */
export const LITERAL_RULES: ReadonlySet<VoiceRule> = new Set(["opener", "promotional", "transition", "meta", "cross_reference", "first_person"]);

export interface VoiceFinding {
  chapter: number;
  paragraph: number;
  section: string | null;
  quote: string;
  rule: VoiceRule;
  severity: "MAJOR" | "MINOR";
  fix: string;
  source: "scan" | "ai";
}

/** What the specialist does about each kind of finding (shown with it). */
export const VOICE_FIX: Record<VoiceRule, string> = {
  opener: "Open with the specific fact or claim instead of the stock phrase.",
  promotional: "Replace the promotional word with the measured value or a plain description.",
  transition: "Connect the paragraph to the last one through its argument, not a transition word.",
  meta: "Delete the announcement and begin with the content itself.",
  cross_reference: "Explain the point here instead of pointing to other sections.",
  first_person: "Write in the third person (the researcher, the study).",
  vague: "Give the actual value, or name the studies.",
  weak_verb: "Use the plain verb (use, consists of) or say what the thing actually does.",
  thin: "Develop the paragraph to four to seven sentences, or merge it with its neighbour.",
  unsupported_claim: "Cite the source for the claim, or remove it.",
  hollow: "Replace the general statement with a specific fact about this project.",
  uniform_rhythm: "Vary the sentence and paragraph lengths.",
  other: "Rewrite the passage in the plain, specific voice the rules ask for.",
};

// ─── The phrase tables (prompts/shared/anti_ai_rules.md) ─────────────────────

/** §2.1 banned opening phrases: `phrase` is the bullet as written, `pattern` matches it at a sentence's start. */
export const BANNED_OPENERS: readonly { phrase: string; pattern: RegExp; severity: "MAJOR" | "MINOR" }[] = [
  { phrase: "In today's rapidly evolving technological landscape", pattern: /^in today['’]s (?:rapidly )?(?:evolving|changing|advancing|dynamic|digital|modern|globali[sz]ed|technological)\b/i, severity: "MAJOR" },
  { phrase: "In today's fast-paced world", pattern: /^in today['’]s (?:fast[- ]paced|modern|contemporary|ever[- ]changing) (?:world|society|era|age)\b/i, severity: "MAJOR" },
  { phrase: "It is important to note that", pattern: /^it is (?:important|crucial|essential) to (?:note|mention|stress|emphasi[sz]e)\b/i, severity: "MAJOR" },
  { phrase: "It should be noted that", pattern: /^it should be (?:noted|mentioned|emphasi[sz]ed)\b/i, severity: "MAJOR" },
  { phrase: "It can clearly be seen that", pattern: /^it can (?:clearly |be clearly )?(?:be )?seen\b/i, severity: "MAJOR" },
  { phrase: "It is worth mentioning that", pattern: /^it is worth (?:mentioning|noting|stating)\b/i, severity: "MAJOR" },
  { phrase: "In light of the foregoing", pattern: /^in (?:the )?light of the foregoing\b/i, severity: "MAJOR" },
  { phrase: "Needless to say", pattern: /^needless to say\b/i, severity: "MAJOR" },
  { phrase: "As we all know", pattern: /^as we all know\b/i, severity: "MAJOR" },
  { phrase: "In this modern era", pattern: /^in this (?:modern|contemporary|digital) (?:era|age|world|time)\b/i, severity: "MAJOR" },
  // "when used as a filler opener with no specific time reference": the AI judges; the scan only notes it.
  { phrase: "In recent times", pattern: /^in recent times\b/i, severity: "MINOR" },
  { phrase: "With the advent of", pattern: /^with the advent of\b/i, severity: "MAJOR" },
];

/** §2.2 promotional words. `allowCited`: allowed when the sentence carries a citation (technically precise use). */
export const PROMOTIONAL: readonly { phrase: string; pattern: RegExp; allowCited?: boolean; except?: RegExp }[] = [
  { phrase: "Groundbreaking", pattern: /\bground[- ]?breaking\b/i },
  // Historical and political terms keep the word: "the Revolutionary United Front", "revolutionary war".
  { phrase: "Revolutionary", pattern: /\brevolutionary\b/i, except: /\brevolutionary (?:war|wars|united|guard|council|movement|movements|government|party|army|forces|period|era|committee|struggle|ideology|ideologies)\b|\b(?:french|american|russian|industrial|green) revolution/i },
  { phrase: "Innovative and revolutionary", pattern: /\binnovative and revolutionary\b/i },
  { phrase: "Cutting-edge", pattern: /\bcutting[- ]edge\b/i, allowCited: true },
  { phrase: "Game-changing", pattern: /\bgame[- ]chang(?:ing|er|ers)\b/i },
  { phrase: "Pivotal role", pattern: /\bpivotal role\b/i },
  { phrase: "Remarkable advancement", pattern: /\bremarkable advance(?:ment|ments|s)?\b/i },
  // Named theories keep the word (Mezirow's transformative learning).
  { phrase: "Transformative", pattern: /\btransformative\b/i, except: /\btransformative (?:learning|leadership|justice|constitutionalism)\b/i },
  { phrase: "State-of-the-art", pattern: /\bstate[- ]of[- ]the[- ]art\b/i, allowCited: true },
];

/** §2.3 transition words; the scan applies the section's rules to them. */
export const TRANSITION_WORDS: readonly string[] = ["Firstly", "Secondly", "Thirdly", "Moreover", "Furthermore", "Additionally", "In addition", "Besides", "What is more"];

/** §2.6 banned meta-commentary. */
export const META_PHRASES: readonly { phrase: string; pattern: RegExp }[] = [
  { phrase: "This section will discuss", pattern: /\bthis (?:section|sub-?section) will (?:discuss|examine|present|look at|explore|consider|focus on|describe|review)\b/i },
  { phrase: "In this paragraph, we will examine", pattern: /\bin this (?:paragraph|section),? (?:we|the researcher|the writer) will\b/i },
  { phrase: "The following section is going to", pattern: /\bthe following (?:section|sub-?section|paragraphs?) (?:is going to|are going to|will)\b/i },
  { phrase: "This chapter aims to", pattern: /\bthis chapter aims to\b/i },
  { phrase: "This study will now look at", pattern: /\bthis study will now (?:look|turn)\b/i },
];

/** §2.4 vague qualifiers, plus the report production spec's (v2 §10.1, Appendix A). */
export const VAGUE_QUALIFIERS: readonly string[] = [
  "high gain",
  "wide bandwidth",
  "good efficiency",
  "high performance",
  "significant improvement",
  "many researchers",
  "increasingly important",
  "highly efficient",
  "high efficiency",
  "good performance",
  "rapidly growing",
  "significant impact",
  "plays a crucial role",
  "cannot be overstated",
];

/** voice_rules.md: weak verbs. */
export const WEAK_VERBS: readonly { phrase: string; pattern: RegExp }[] = [
  { phrase: "utilize", pattern: /\butili[sz](?:e|es|ed|ing|ation)\b/i },
  { phrase: "is comprised of", pattern: /\b(?:is|are|was|were) comprised of\b/i },
  { phrase: "plays a role in", pattern: /\bplays? a role in\b/i },
  { phrase: "is associated with", pattern: /\b(?:is|are|was|were) associated with\b/i },
];

// ─── The scan ────────────────────────────────────────────────────────────────

const CITED = /\((?:[^()]*?\b(?:19|20)\d{2}[a-z]?)[^()]*\)|\b\p{Lu}[\p{L}'’-]+(?:\s+et al\.?)?\s+\((?:19|20)\d{2}/u;
const OUTLINE_SECTION = /outline|organi[sz]ation of the|structure of the (?:study|report|project|thesis)|chapter (?:summary|overview)|summary/i;
const CROSS_REF = /\b(?:(?:sub-?)?section\s+\d+(?:\.\d+)+|chapter\s+(?:one|two|three|four|five|six|[1-6])\b)/gi;
/** First person, outside quotation marks: we, our, us, my, and "I" before a verb. */
const FIRST_PERSON = /\b(?:[Ww]e|[Oo]urs?|us|[Mm]y)\b|\bI (?:am|was|have|had|found|find|believe|think|will|would|shall|feel|observed|conducted|used|designed|chose|noticed|argue|propose|recommend|conclude|developed|collected|interviewed|wish|thank|acknowledge|appreciate|owe|dedicate)\b/;
const stripQuotes = (s: string) => s.replace(/“[^”]*”|"[^"]*"/g, " ");

function finding(p: ProseParagraph, quote: string, rule: VoiceRule, severity: "MAJOR" | "MINOR"): VoiceFinding {
  return { chapter: p.chapter, paragraph: p.index, section: p.section, quote: shortQuote(quote, 200), rule, severity, fix: VOICE_FIX[rule], source: "scan" };
}

export function scanVoice(paragraphs: ProseParagraph[]): VoiceFinding[] {
  const out: VoiceFinding[] = [];
  const byChapter = new Map<number, ProseParagraph[]>();
  for (const p of paragraphs) byChapter.set(p.chapter, [...(byChapter.get(p.chapter) ?? []), p]);

  for (const [, paras] of byChapter) {
    const ordinals: { p: ProseParagraph; s: string }[] = [];
    const additives: { p: ProseParagraph; s: string }[] = [];
    const thin: ProseParagraph[] = [];
    paras.forEach((p, i) => {
      const sentences = splitSentences(p.text);
      for (const s of sentences) {
        const opener = BANNED_OPENERS.find((o) => o.pattern.test(s));
        if (opener) out.push(finding(p, s, "opener", opener.severity));
        if (/^(?:Firstly|Secondly|Thirdly)\b/.test(s)) ordinals.push({ p, s });
        for (const w of PROMOTIONAL) {
          if (!w.pattern.test(s) || (w.except && w.except.test(s)) || (w.allowCited && CITED.test(s))) continue;
          out.push(finding(p, s, "promotional", "MAJOR"));
          break;
        }
        const meta = META_PHRASES.find((m) => m.pattern.test(s));
        if (meta) out.push(finding(p, s, "meta", "MAJOR"));
        const bare = stripQuotes(s);
        if (FIRST_PERSON.test(bare)) out.push(finding(p, s, "first_person", "MAJOR"));
        const lower = s.toLowerCase();
        const vague = VAGUE_QUALIFIERS.find((v) => lower.includes(v));
        if (vague) out.push(finding(p, s, "vague", "MINOR"));
        const weak = WEAK_VERBS.find((v) => v.pattern.test(s));
        if (weak) out.push(finding(p, s, "weak_verb", "MINOR"));
      }
      const first = sentences[0] ?? p.text;
      if (/^(?:Moreover|Furthermore|Additionally)\b/.test(first)) out.push(finding(p, first, "transition", "MAJOR"));
      if (/^What is more\b/i.test(first)) out.push(finding(p, first, "transition", "MAJOR"));
      if (/^(?:In addition|Besides)\b/.test(first)) additives.push({ p, s: first });
      // More than one section cross-reference in a paragraph (a chapter's opening and outline paragraphs may point ahead).
      const refs = p.text.match(CROSS_REF) ?? [];
      if (refs.length > 1 && i > 0 && !OUTLINE_SECTION.test(p.section ?? "")) out.push(finding(p, `${refs.join("; ")} (${refs.length} references in one paragraph)`, "cross_reference", "MAJOR"));
      // Thin: one or two sentences of prose (list lead-ins ending in a colon are not paragraphs).
      if (sentences.length <= 2 && !/:\s*$/.test(p.text) && p.text.split(/\s+/).length >= 6 && !/^\[[^\]]*\]$/.test(p.text)) thin.push(p);
    });
    const distinct = new Set(ordinals.map((o) => o.s.split(/\s/)[0]));
    if (distinct.size >= 2) out.push(finding(ordinals[1].p, ordinals.map((o) => o.s.split(/[,\s]/)[0]).join("… "), "transition", "MAJOR"));
    if (additives.length >= 2) for (const a of additives) out.push(finding(a.p, a.s, "transition", "MAJOR"));
    if (thin.length) {
      const f = finding(thin[0], `${thin.length} paragraph${thin.length === 1 ? " is" : "s are"} one or two sentences long (¶${thin.slice(0, 6).map((t) => t.index).join(", ¶")}${thin.length > 6 ? "…" : ""})`, "thin", "MINOR");
      out.push(f);
    }
  }
  return out;
}

// ─── The AI pass: tool and checks on what comes back ─────────────────────────

export const VOICE_TOOL_NAME = "record_voice_findings";

export const VOICE_TOOL = {
  name: VOICE_TOOL_NAME,
  description: "Record every passage of the chapter that breaks the voice rules, quoted exactly.",
  input_schema: {
    type: "object",
    properties: {
      findings: {
        type: "array",
        maxItems: 20,
        items: {
          type: "object",
          properties: {
            paragraph: { type: "integer", description: "The ¶ number of the paragraph." },
            quote: { type: "string", description: "The offending words, copied exactly from that paragraph (at most 25 words)." },
            rule: { type: "string", enum: ["opener", "promotional", "transition", "meta", "cross_reference", "first_person", "unsupported_claim", "hollow", "vague", "uniform_rhythm", "other"] },
            severity: { type: "string", enum: ["MAJOR", "MINOR"] },
            fix: { type: "string", description: "One sentence: what to change." },
          },
          required: ["paragraph", "quote", "rule", "severity", "fix"],
        },
      },
      readsHuman: { type: "boolean", description: "Would a supervisor believe a student wrote this chapter?" },
      note: { type: "string", description: "One or two sentences on the chapter's voice overall." },
    },
    required: ["findings", "readsHuman", "note"],
  },
} as const;

/** The AI's findings, kept only when the quote really is in the paragraph named; the rest are counted as dropped. */
export function validateAiVoiceFindings(
  raw: unknown,
  chapter: number,
  paragraphs: ProseParagraph[],
): { findings: VoiceFinding[]; dropped: number; readsHuman: boolean | null; note: string | null } {
  const input = (raw ?? {}) as { findings?: unknown; readsHuman?: unknown; note?: unknown };
  let list: unknown = input.findings;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      list = [];
    }
  }
  const items = Array.isArray(list) ? list : [];
  const rules = new Set<string>(VOICE_TOOL.input_schema.properties.findings.items.properties.rule.enum);
  const findings: VoiceFinding[] = [];
  let dropped = 0;
  for (const it of items as Record<string, unknown>[]) {
    const index = Number(it?.paragraph);
    const p = paragraphs.find((x) => x.chapter === chapter && x.index === index);
    const quote = typeof it?.quote === "string" ? it.quote : "";
    const rule = typeof it?.rule === "string" && rules.has(it.rule) ? (it.rule as VoiceRule) : "other";
    const q = normaliseForMatch(quote);
    if (!p || q.length < 3 || !normaliseForMatch(p.text).includes(q)) {
      dropped++;
      continue;
    }
    findings.push({
      chapter,
      paragraph: p.index,
      section: p.section,
      quote: shortQuote(quote, 200),
      rule,
      severity: it?.severity === "MAJOR" ? "MAJOR" : "MINOR",
      fix: typeof it?.fix === "string" && it.fix.trim() ? it.fix.trim() : VOICE_FIX[rule],
      source: "ai",
    });
  }
  return {
    findings,
    dropped,
    readsHuman: typeof input.readsHuman === "boolean" ? input.readsHuman : null,
    note: typeof input.note === "string" ? input.note.trim() || null : null,
  };
}

/** An AI finding the scan already made (same paragraph, overlapping words) is not listed twice. */
export function mergeVoiceFindings(scan: VoiceFinding[], ai: VoiceFinding[]): VoiceFinding[] {
  const out = [...scan];
  for (const f of ai) {
    const q = normaliseForMatch(f.quote);
    const dup = scan.some((s) => s.chapter === f.chapter && s.paragraph === f.paragraph && (normaliseForMatch(s.quote).includes(q) || q.includes(normaliseForMatch(s.quote))));
    if (!dup) out.push(f);
  }
  return out;
}

/** The one voice check: fails on any MAJOR literal banned construction; every other finding is a WARN for the COO. */
export function voiceCheck(findings: VoiceFinding[], notes: { chapter: number; readsHuman: boolean | null; note: string | null }[] = []): CheckResult {
  const label: Record<VoiceRule, string> = {
    opener: "Banned opening phrase",
    promotional: "Promotional language",
    transition: "Banned transition",
    meta: "Meta-commentary",
    cross_reference: "Section cross-references instead of explanation",
    first_person: "First person",
    vague: "Vague qualifier",
    weak_verb: "Weak verb",
    thin: "Thin paragraphs",
    unsupported_claim: "Unsupported claim",
    hollow: "Hollow statement",
    uniform_rhythm: "Uniform rhythm",
    other: "Voice",
  };
  // D7b: a finding in the preliminary pages (chapter 0) is a WARN for the COO, who corrects it by hand:
  // the page writer is not given the anti-AI rules, and re-generating a chapter cannot fix it.
  const issues: QualityIssue[] = findings.map((f): QualityIssue => {
    const prelim = f.chapter === PRELIM_CHAPTER;
    return {
      level: !prelim && f.severity === "MAJOR" && LITERAL_RULES.has(f.rule) ? "FAIL" : "WARN",
      message: `${label[f.rule]}${f.section ? ` in ${f.section}` : ""}${f.source === "ai" ? " (voice review)" : ""}.`,
      chapter: prelim ? null : f.chapter,
      paragraph: f.paragraph,
      quote: f.quote,
      fix: prelim ? `${f.fix} Correct it by hand on the Preliminary pages card (Report tab).` : f.fix,
    };
  });
  for (const n of notes) {
    if (n.readsHuman === false) issues.push({ level: "WARN", message: `Chapter ${n.chapter} may read as machine-written${n.note ? `: ${n.note}` : "."}`, chapter: n.chapter, fix: VOICE_FIX.uniform_rhythm });
  }
  const failed = issues.filter((i) => i.level === "FAIL").length;
  return result(
    { id: "VOICE", layer: "voice", title: "Voice (anti-AI and voice rules)", severity: "MAJOR" },
    issues,
    {
      pass: issues.length ? `No banned construction; ${issues.length} note${issues.length === 1 ? "" : "s"} for the COO.` : "No banned phrase, transition, meta-commentary or first person.",
      fail: `${failed} banned construction${failed === 1 ? "" : "s"} found.`,
    },
  );
}
