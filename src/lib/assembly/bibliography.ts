/**
 * The NALT bibliography of a law report: PRIMARY SOURCES then SECONDARY SOURCES
 * (the founder's call, 26 Nov 2026; NALT Part Three describes one alphabetical
 * list, the benchmark long essay splits it and so does HQ's own law prompt).
 *
 * The secondary sources come from the verified reference list, formatted in NALT
 * form. The primary sources are not on that list — a statute, a treaty and a
 * decided case are cited in the footnotes and nowhere else — so they are read
 * back out of the footnotes the report actually carries: the pinpoint is taken
 * off ("Child's Rights Act 2003 (Nigeria), s 34." becomes "Child's Rights Act
 * 2003 (Nigeria)"), short forms and cross-references are skipped, and what is
 * left is grouped and sorted. Nothing is invented: a report that cites no
 * statute gets no statute heading.
 *
 * Pure: no database, no docx.
 */

export type PrimaryGroup = "Treaties and International Instruments" | "Statutes and Subsidiary Legislation" | "Cases" | "Resolutions and Official Documents";

export const PRIMARY_GROUPS: readonly PrimaryGroup[] = [
  "Treaties and International Instruments",
  "Statutes and Subsidiary Legislation",
  "Cases",
  "Resolutions and Official Documents",
];

/** A footnote that only points at an earlier one carries no citation to list. */
const SHORT_FORM = /^\s*\**\s*(?:ibid|id\b)/i;
const CROSS_REF = /\(n\s*\d{1,3}\)/;

/** A decided case: parties separated by an unpunctuated "v", or an "Re"/"Ex p" application. */
const CASE = /(?:^|\*)\s*(?:Re\s|Ex\sp\s)|\sv\s/;
/** A treaty or other international instrument. */
const TREATY = /\badopted\s+\d|\bUNTS\b|\bentered into force\b|^\s*\**\s*(?:Geneva Convention|Convention|Protocol|Optional Protocol|Covenant|Charter|Treaty|Rome Statute|ILO Convention|Universal Declaration)\b/i;
/** A resolution, a UN document or another official paper of an organ. */
const RESOLUTION = /\b(?:UNSC|UNGA|SC|GA)\s+Res\b|\bUN\s+Doc\b|\bResolution\s+\d|\bA\/RES\/|\bS\/RES\//i;
/** A statute, subsidiary legislation, rules of court or a practice direction. */
const STATUTE = /\b(?:Act|Law|Laws|Decree|Edict|Bye-?laws?|Rules|Regulations|Order|Practice Direction|Constitution|Cap)\b/;

/** The pinpoint a footnote adds and a bibliography entry does not carry. */
const PINPOINT_TAIL = /(?:,\s*|\s+)(?:ss?|arts?|paras?|pts?|schs?|sub-ss?|chs?|rr?|pp?)\s+[\dIVXivx]+[^,;]*$/i;
const PARA_TAIL = /(?:,\s*|\s+)(?:paras?|pp?)\s+[\d\s,–-]+(?:and\s+[\d\s–-]+)?$/i;
const PAGE_TAIL = /\s+\d{1,4}(?:\s*[–-]\s*\d{1,4})?$/;

export interface PrimaryEntry {
  group: PrimaryGroup;
  text: string;
}

function tidy(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[,;.\s]+$/, "")
    .trim();
}

/**
 * A footnote that only points back at an earlier one ("ibid", "Drumbl (n 24) 96"):
 * it cites nothing new, so it is neither a bibliography entry nor a work that
 * could be missing from the reference list.
 */
export function isShortForm(note: string): boolean {
  return SHORT_FORM.test(note) || CROSS_REF.test(note);
}

/** Which part of the bibliography a full footnote citation belongs to, or null when it is a secondary work. */
export function primaryGroupOf(note: string): PrimaryGroup | null {
  const bare = note.replace(/\*/g, "");
  if (RESOLUTION.test(bare)) return "Resolutions and Official Documents";
  if (CASE.test(note) || CASE.test(bare)) return "Cases";
  if (TREATY.test(bare)) return "Treaties and International Instruments";
  if (STATUTE.test(bare)) return "Statutes and Subsidiary Legislation";
  return null;
}

/** The footnote without its pinpoint: what the bibliography lists. */
export function withoutPinpoint(note: string, group: PrimaryGroup): string {
  let s = note.trim().replace(/\.$/, "");
  // A case's own report page is part of its citation; only a paragraph or page pinpoint comes off.
  if (group === "Cases") {
    let before = "";
    while (before !== s) {
      before = s;
      s = s.replace(PARA_TAIL, "");
    }
    return tidy(s);
  }
  let before = "";
  while (before !== s) {
    before = s;
    s = s.replace(PINPOINT_TAIL, "").replace(PARA_TAIL, "");
  }
  return tidy(s);
}

/** A secondary work's footnote without its page pinpoint (for the note to the specialist). */
export function secondaryWithoutPinpoint(note: string): string {
  return tidy(note.trim().replace(/\.$/, "").replace(PAGE_TAIL, ""));
}

function sortKey(s: string): string {
  return s
    .replace(/\*/g, "")
    .replace(/^(?:The|A|An)\s+/i, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

export interface PrimarySources {
  /** The groups that have entries, in NALT's order, each alphabetical. */
  groups: { group: PrimaryGroup; entries: string[] }[];
  /** Full footnote citations of secondary works, for the report's note to the specialist. */
  secondary: string[];
  /** Footnotes that were only short forms or cross-references. */
  shortForms: number;
}

/**
 * The primary sources a report's footnotes cite, grouped and sorted, with each
 * citation listed once however many footnotes use it.
 */
export function primarySourcesFrom(notes: readonly { text: string }[]): PrimarySources {
  const seen = new Map<PrimaryGroup, Map<string, string>>();
  const secondary = new Map<string, string>();
  let shortForms = 0;
  for (const n of notes) {
    const text = n.text.trim();
    if (!text) continue;
    if (SHORT_FORM.test(text) || CROSS_REF.test(text)) {
      shortForms++;
      continue;
    }
    const group = primaryGroupOf(text);
    if (!group) {
      const entry = secondaryWithoutPinpoint(text);
      if (entry) secondary.set(sortKey(entry), entry);
      continue;
    }
    const entry = withoutPinpoint(text, group);
    if (!entry) continue;
    const bucket = seen.get(group) ?? new Map<string, string>();
    bucket.set(sortKey(entry), entry);
    seen.set(group, bucket);
  }
  return {
    groups: PRIMARY_GROUPS.filter((g) => seen.has(g)).map((group) => ({
      group,
      entries: [...(seen.get(group) ?? new Map<string, string>()).entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v),
    })),
    secondary: [...secondary.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v),
    shortForms,
  };
}
