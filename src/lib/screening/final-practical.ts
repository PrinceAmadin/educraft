/**
 * Stage-3 final practical: the pure rules and the candidate's wording. Two
 * writing samples (voice-scanned for the COO), a client-message task and a
 * prompting task (text the COO reads). There is no automatic pass mark — the
 * final practical is the COO's call, with the voice scan as an advisory signal.
 *
 * Pure (the voice scan it calls is itself pure), so `check:final`, the candidate
 * page and the grading service share one definition.
 */

import type { ProseParagraph } from "@/lib/quality/prose";
import { VOICE_FIX, scanVoice, type VoiceFinding, type VoiceRule } from "@/lib/quality/voice-scan";

/** The default briefs, which the founder can edit on the screening settings page. */
export const FINAL_DEFAULTS = {
  minutes: 120,
  writingBrief1:
    "Write the Introduction (Background to the Study and Statement of the Problem) for a final-year project on a topic in your field. Write in your own words, in a plain academic voice, aiming for 500 to 700 words. Save it as a Word document and upload it.",
  writingBrief2:
    "Write a short Literature Review that discusses three studies relevant to that same topic, with in-text citations (author, year). Aim for 400 to 600 words. Save it as a Word document and upload it.",
  memoBrief:
    "A supervisor has returned a student's chapter with these comments:\n\n“The objectives are vague and do not match the questions. The literature review reads like a list of summaries with no argument. Fix these before resubmitting.”\n\nWrite the message you would send the student explaining, in plain and reassuring language, what you will change and why.",
  promptBrief:
    "Our systems are unavailable and you must write a Methodology section by hand for a quantitative study. Describe, step by step, how you would research it, structure it and write it to a first-class standard — the sections you would include and what goes in each.",
} as const;

export const FINAL_SETTING_KEYS = {
  minutes: "final_minutes",
  writingBrief1: "final_writing_brief_1",
  writingBrief2: "final_writing_brief_2",
  memoBrief: "final_memo_brief",
  promptBrief: "final_prompt_brief",
} as const;

// ── The chapter voice scan (advisory) ────────────────────────────────────────

const VOICE_LABEL: Record<VoiceRule, string> = {
  opener: "Stock opener",
  promotional: "Promotional language",
  transition: "Filler transition",
  meta: "Meta-commentary",
  cross_reference: "Cross-reference instead of explanation",
  first_person: "First person",
  vague: "Vague qualifier",
  weak_verb: "Weak verb",
  thin: "Thin paragraph",
  unsupported_claim: "Unsupported claim",
  hollow: "Hollow statement",
  uniform_rhythm: "Uniform rhythm",
  other: "Voice",
};

export interface ChapterVoice {
  /** Banned/weak constructions found, each with a short quote. */
  findings: { rule: VoiceRule; label: string; quote: string; severity: "MAJOR" | "MINOR"; fix: string }[];
  /** How many are MAJOR (a strong AI tell). */
  majorCount: number;
  total: number;
  /** No prose to scan (empty or not uploaded). */
  empty: boolean;
}

function paragraphsOf(text: string): ProseParagraph[] {
  return text
    .split(/\n\s*\n+/)
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((t, i) => ({ chapter: 1, index: i + 1, section: null, text: t, firstInSection: i === 0 }));
}

/** Scans one writing sample's text for the voice tells the COO should weigh. */
export function scanChapterVoice(text: string | null | undefined): ChapterVoice {
  const body = (text ?? "").trim();
  if (!body) return { findings: [], majorCount: 0, total: 0, empty: true };
  const findings: VoiceFinding[] = scanVoice(paragraphsOf(body));
  return {
    findings: findings.map((f) => ({ rule: f.rule, label: VOICE_LABEL[f.rule], quote: f.quote, severity: f.severity, fix: VOICE_FIX[f.rule] })),
    majorCount: findings.filter((f) => f.severity === "MAJOR").length,
    total: findings.length,
    empty: false,
  };
}

// ── Candidate wording ─────────────────────────────────────────────────────────

export const FINAL_TEXT = {
  introTitle: "EduCraft final assessment",
  introBody:
    "You have passed the first stage. This final assessment is the real work of the job: writing to our standard and showing the judgement a strong writer needs. Read each part carefully before you begin.",
  timeNote: (minutes: number) => `Once you start you have ${minutes} minutes. Work on your own, in one sitting.`,
  startLabel: "Start the assessment",
  notFound: "This link is not valid. Check that you copied the whole link, or ask EduCraft for a new one.",

  writing1Title: "Part 1 — Write an introduction",
  writing2Title: "Part 2 — Write a literature review",
  writingUploadLabel: "Upload your Word document",
  writingUploadHint: "A Word document (.docx), up to 5 MB.",
  writingUploaded: "Received. You can upload it again to replace it before you submit.",
  writingUploadError: "That file did not upload. It must be a Word document (.docx) under 5 MB.",

  memoTitle: "Part 3 — Reply to the supervisor",
  memoAnswerLabel: "Your message",
  promptTitle: "Part 4 — Working without our tools",
  promptAnswerLabel: "Your answer",
  responsePlaceholder: "Write your answer here…",

  submitLabel: "Submit my assessment",
  submitting: "Submitting…",
  answerAll: "Complete every part before submitting: upload both documents and answer both questions.",
  submitError: "That did not go through. Check your connection and try again.",
  doneTitle: "All done",
  doneBody: "Thank you for completing the EduCraft final assessment. We will review your work and be in touch by email.",

  emailSubject: "Your EduCraft final assessment",
  emailLine:
    "Congratulations on passing the first stage. The final step is a short assessment of your writing and judgement. Open the link below to take it — it is not timed until you press start.",
} as const;
