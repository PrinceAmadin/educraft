/**
 * Phase D7: the text rules document assembly applies to generated chapter
 * text before it becomes Word runs. Pure (no database, no docx), so
 * scripts/check-assembly.ts can prove each one.
 *
 *   inlineSegments   *italics*, et al. italic (P4/R5), stray asterisks
 *   fixSentenceDashes  P2: no em/en dashes as sentence separators
 *   titleCase / sentenceCase / upperH1   AL2-AL4
 *   renumberEquationRefs   EQ3/EQ4: "Equation (3.1)" -> the assembly's "Equation 3.1"
 *   findPlaceholders   what the specialist still has to fill in
 *   citationsIn / citedReferences   the References list holds only works cited
 */

export interface Seg {
  text: string;
  italics?: boolean;
  /** Set as a subscript (a symbol written "f_m" in the prose). */
  sub?: boolean;
  /**
   * Set as a superscript. Note-style citations (MODE_B document endnotes, MODE_C page footnotes and
   * MODE_A chapter endnotes) put a number in the body ("...the market for cassava.^3") and list the
   * notes at the chapter's end; the assembly renders each such number as a real Word superscript.
   */
  sup?: boolean;
}

/**
 * The model writes symbols in its prose the way it writes them in equations:
 * "where f_m is the target mean strength". A single letter (Latin or Greek)
 * followed by "_x" or "_{xy}" becomes the letter with a real subscript.
 */
export function subscriptSymbols(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  const pattern = /(?<![\p{L}\d_])([A-Za-zΑ-Ωα-ω])_(\{[^}\s]{1,12}\}|[A-Za-z0-9]{1,10})(?![\p{L}\d_])/gu;
  for (const seg of segs) {
    if (seg.sub || !seg.text.includes("_")) {
      out.push(seg);
      continue;
    }
    let last = 0;
    for (const m of seg.text.matchAll(pattern)) {
      const at = m.index ?? 0;
      if (at > last) out.push({ ...seg, text: seg.text.slice(last, at) });
      out.push({ ...seg, text: m[1] });
      out.push({ ...seg, text: m[2].replace(/^\{|\}$/g, ""), sub: true });
      last = at + m[0].length;
    }
    if (last < seg.text.length) out.push({ ...seg, text: seg.text.slice(last) });
  }
  return out.filter((s) => s.text);
}

// ─── Inline runs ─────────────────────────────────────────────────────────────

/** "et al." (with or without the full stop, and the common "et. al." slip), always italic. */
const ET_AL = /\bet\.?\s+al\b\.?/g;

/** Splits the non-italic parts of `segs` so every "et al." is its own italic segment, written "et al.". */
export function italiciseEtAl(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (const seg of segs) {
    if (seg.italics) {
      out.push({ text: seg.text.replace(ET_AL, "et al."), italics: true });
      continue;
    }
    let last = 0;
    for (const m of seg.text.matchAll(ET_AL)) {
      const at = m.index ?? 0;
      if (at > last) out.push({ text: seg.text.slice(last, at) });
      out.push({ text: "et al.", italics: true });
      last = at + m[0].length;
      // "et al.," keeps its comma; "et al. (2020)" keeps its space: only the letters and the stop are replaced.
    }
    if (last < seg.text.length) out.push({ text: seg.text.slice(last) });
  }
  return mergeSegments(out);
}

function mergeSegments(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (const s of segs) {
    if (!s.text) continue;
    const prev = out[out.length - 1];
    if (prev && Boolean(prev.italics) === Boolean(s.italics)) prev.text += s.text;
    else out.push({ text: s.text, ...(s.italics ? { italics: true } : {}) });
  }
  return out;
}

/**
 * The model marks italics with single asterisks and nothing else (bold is not
 * allowed in the body, so "**" markers are dropped). A pair of asterisks around
 * text is italic; a stray asterisk is removed from prose but kept in a table
 * cell, where it is a significance star ("0.032*").
 */
export function inlineSegments(text: string, opts: { inTable?: boolean } = {}): Seg[] {
  let s = text.replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, "$1");
  if (!opts.inTable) s = s.replace(/\*\*/g, "");
  const segs: Seg[] = [];
  const pair = /\*(?=[^\s*])([^*\n]*?[^\s*])\*/g;
  let last = 0;
  for (const m of s.matchAll(pair)) {
    const at = m.index ?? 0;
    // A significance star straight after a number is not an opening italic marker.
    if (opts.inTable && /\d$/.test(s.slice(0, at))) continue;
    if (at > last) segs.push({ text: s.slice(last, at) });
    segs.push({ text: m[1], italics: true });
    last = at + m[0].length;
  }
  if (last < s.length) segs.push({ text: s.slice(last) });
  const cleaned = opts.inTable ? segs : segs.map((g) => ({ ...g, text: g.text.replace(/\*/g, "") }));
  return superscriptNotes(subscriptSymbols(italiciseEtAl(cleaned)));
}

/**
 * Note-style citation markers in prose: "^3", "^{12}", "^[3]" or a "[3]" that trails a word
 * ("...adoption trends.[3]") become a real Word superscript. Real square-bracketed placeholders
 * like [DATA NOT PROVIDED …] are left alone: the marker is only matched when it is a number that
 * is not part of a larger square-bracketed placeholder token. Numbers alone in the flow of prose
 * ("in the last 5 years") are left alone: the caret is what marks the citation.
 */
const SUPERSCRIPT_DIGIT: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };

/** "¹²" -> 12. */
export function superscriptNumber(s: string): number {
  return Number([...s].map((c) => SUPERSCRIPT_DIGIT[c] ?? "").join(""));
}

export function superscriptNotes(segs: Seg[]): Seg[] {
  // Superscript characters (¹, ², ³) become a real Word superscript too: a model sometimes writes a note
  // number that way, and "R²" set as R with a superscript 2 looks exactly the same.
  const pattern = /(?:\^\{(\d{1,3})\})|(?:\^\[(\d{1,3})\])|(?:\^(\d{1,3}))|(?:(?<=[\p{L}.,;:!?)"'’”])\[(\d{1,3})\](?![\p{L}\d]))|([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/gu;
  const out: Seg[] = [];
  for (const seg of segs) {
    if (seg.sub || seg.sup || (!seg.text.includes("^") && !seg.text.includes("[") && !/[⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(seg.text))) {
      out.push(seg);
      continue;
    }
    let last = 0;
    for (const m of seg.text.matchAll(pattern)) {
      const at = m.index ?? 0;
      const digits = m[1] ?? m[2] ?? m[3] ?? m[4] ?? (m[5] ? String(superscriptNumber(m[5])) : undefined);
      if (!digits) continue;
      if (at > last) out.push({ ...seg, text: seg.text.slice(last, at) });
      out.push({ ...seg, text: digits, sup: true, italics: false });
      last = at + m[0].length;
    }
    if (last === 0) out.push(seg);
    else if (last < seg.text.length) out.push({ ...seg, text: seg.text.slice(last) });
  }
  return out.filter((s) => s.text);
}

// ─── P2: dashes ──────────────────────────────────────────────────────────────

/**
 * An em dash, an en dash or a spaced hyphen used as a sentence separator becomes
 * a comma. Number ranges (2000–2023, pp. 12–15), compounds (co-operative,
 * Nigeria–Ghana) and anything inside [square brackets] (the placeholders) are
 * left alone.
 */
export function fixSentenceDashes(text: string): { text: string; fixed: number } {
  let fixed = 0;
  const parts = text.split(/(\[[^\]]*\])/);
  const out = parts.map((part) => {
    if (part.startsWith("[")) return part;
    return part
      .replace(/(\S?)\s+[—–]\s+(\S?)/g, (m, before: string, after: string) => {
        if (/\d/.test(before) && /\d/.test(after)) return m; // "12 – 15" is a range
        fixed++;
        return `${before}, ${after}`;
      })
      .replace(/(?<=[A-Za-z)'’"”])—(?=[A-Za-z('‘"“])/g, () => {
        fixed++;
        return ", ";
      })
      .replace(/(?<=[A-Za-z)'’"”])\s+-{1,2}\s+(?=[A-Za-z('‘"“])/g, () => {
        fixed++;
        return ", ";
      });
  });
  // A dash that ended a clause may leave ", ," or ",." behind.
  const joined = out.join("").replace(/,\s*,/g, ",").replace(/,\s*([.;:!?])/g, "$1");
  return { text: joined, fixed };
}

// ─── Heading case (AL2-AL4) ─────────────────────────────────────────────────

const MINOR = new Set(["a", "an", "the", "and", "but", "or", "nor", "for", "so", "yet", "of", "in", "on", "at", "to", "by", "with", "from", "as", "via", "per", "vs", "vs.", "into", "onto", "upon", "than", "over", "within", "among", "amongst", "between", "through", "towards", "toward", "across", "about", "against", "without"]);

/** Tokens kept exactly as written: acronyms (SPSS, GDP), mixed case (mHealth, iPhone), and anything with a digit (COVID-19, H2O). */
function keepAsWritten(word: string): boolean {
  const bare = word.replace(/[^A-Za-z0-9]/g, "");
  if (!bare) return true;
  if (/\d/.test(bare)) return true;
  if (bare.length >= 2 && bare === bare.toUpperCase() && /[A-Z]/.test(bare)) return true;
  if (/[a-z][A-Z]/.test(bare)) return true;
  return false;
}

/** Common acronyms that must survive a heading written all in capitals. */
const KNOWN_ACRONYMS = new Set(["SPSS", "GDP", "ICT", "IT", "AI", "SME", "SMES", "ANOVA", "OLS", "ARDL", "VAR", "VECM", "CBN", "NBS", "NGO", "NGOS", "HIV", "AIDS", "COVID", "UK", "USA", "UN", "WHO", "IOT", "ERP", "CRM", "HRM", "ROI", "ROA", "ROE", "FDI", "MPR", "CPI", "PLC", "ISO", "LAN", "WAN", "GSM", "GPS", "PV", "AC", "DC", "RHA", "OPC", "BS", "ASTM", "NIS", "UML", "SQL", "API", "PHP", "HTML", "CSS", "USSD", "ATM", "POS", "BVN", "NIN", "JAMB", "WAEC", "NECO", "UTME", "LGA", "FCT", "NHIS", "PHC", "WASH"]);

/** Splits "1.1 Background of the Study" into the number and the words. */
function splitNumber(heading: string): { number: string; words: string } {
  const m = /^(\d+(?:\.\d+)*\.?)\s+(.*)$/.exec(heading.trim());
  return m ? { number: m[1].replace(/\.$/, ""), words: m[2] } : { number: "", words: heading.trim() };
}

const join = (number: string, words: string) => (number ? `${number} ${words}` : words);

function capitaliseParts(word: string): string {
  return word.replace(/(^|[-/(‘'"“])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
}

function isAllCaps(words: string): boolean {
  const letters = words.replace(/[^A-Za-z]/g, "");
  return letters.length >= 4 && letters === letters.toUpperCase();
}

/** AL3 (Heading 2): Title Case — each word capitalised except minor words; acronyms and numbers untouched. */
export function titleCase(heading: string): string {
  const { number, words } = splitNumber(heading);
  const shouted = isAllCaps(words);
  let afterColon = false;
  const out = words
    .split(/(\s+)/)
    .map((w, i) => {
      if (/^\s*$/.test(w)) return w;
      const first = i === 0 || afterColon;
      afterColon = /[:?]$/.test(w);
      const bare = w.replace(/[^A-Za-z]/g, "");
      if (shouted) {
        if (KNOWN_ACRONYMS.has(bare.toUpperCase()) && bare.length > 1) return w;
        const lower = w.toLowerCase();
        if (!first && MINOR.has(lower.replace(/[^a-z.]/g, ""))) return lower;
        return capitaliseParts(lower);
      }
      if (keepAsWritten(w)) return w;
      const lower = w.toLowerCase();
      if (!first && MINOR.has(lower.replace(/[^a-z.]/g, ""))) return lower;
      return capitaliseParts(w);
    })
    .join("");
  return join(number, out);
}

/**
 * AL4 (Heading 3): sentence case — the first word capitalised; a later word is
 * lower-cased only when it is written Capitalised, is not a proper noun the
 * chapters use (Nigeria, Lagos, Taro Yamane) and does not follow a colon.
 */
export function sentenceCase(heading: string, properNouns: ReadonlySet<string> = new Set()): string {
  const { number, words } = splitNumber(heading);
  const shouted = isAllCaps(words);
  let afterColon = false;
  const out = words
    .split(/(\s+)/)
    .map((w, i) => {
      if (/^\s*$/.test(w)) return w;
      const first = i === 0 || afterColon;
      afterColon = /[:?]$/.test(w);
      const bare = w.replace(/[^A-Za-z]/g, "");
      if (shouted) {
        if (KNOWN_ACRONYMS.has(bare.toUpperCase()) && bare.length > 1) return w;
        if (properNouns.has(bare.charAt(0) + bare.slice(1).toLowerCase())) return capitaliseParts(w.toLowerCase());
        return first ? capitaliseParts(w.toLowerCase()) : w.toLowerCase();
      }
      if (first) return w.charAt(0).toUpperCase() + w.slice(1);
      if (keepAsWritten(w)) return w;
      if (/^[A-Z][a-z'’-]*$/.test(bare) && !properNouns.has(bare)) return w.toLowerCase();
      return w;
    })
    .join("");
  return join(number, out);
}

/** AL2 (Heading 1): upper case. */
export function upperH1(text: string): string {
  return text.trim().toUpperCase();
}

/**
 * Words the chapters capitalise in the middle of a sentence (Nigeria, Lagos,
 * Yamane): the proper nouns a sentence-case heading must keep.
 */
export function properNounsFrom(texts: string[]): Set<string> {
  const capitalised = new Set<string>();
  const lower = new Set<string>();
  for (const text of texts) {
    for (const line of text.split(/\n+/)) {
      // Prose only: headings, table rows and captions are written in Title Case, which says nothing about names.
      if (/^\s*\[H[123]\]/.test(line) || line.includes("|") || /^\s*\**\s*(?:Table|Figure|Fig\.)\s+\d/i.test(line) || /^\s*\[/.test(line)) continue;
      for (const w of line.match(/\p{L}[\p{L}'’-]*/gu) ?? []) if (w === w.toLowerCase()) lower.add(w);
      for (const sentence of line.split(/(?<=[.!?:])\s+/)) {
        const words = sentence.split(/\s+/);
        for (let i = 1; i < words.length; i++) {
          const bare = words[i].replace(/^[("'‘“[]+|[)"'’”\],.;:!?]+$/g, "");
          if (/^\p{Lu}[\p{Ll}'’-]+$/u.test(bare) && !/[.!?:]$/.test(words[i - 1])) capitalised.add(bare);
        }
      }
    }
  }
  // A word the chapters also write in lower case ("rice husk ash") is not a name, even where a sentence capitalises it.
  return new Set([...capitalised].filter((w) => !lower.has(w.toLowerCase())));
}

const CHAPTER_WORDS = ["ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN"];
export function chapterWord(n: number): string {
  return CHAPTER_WORDS[n] ?? String(n);
}

// ─── Equations (EQ3/EQ4) ────────────────────────────────────────────────────

/**
 * In-text references to an equation, "Equation (3.1)", "equation 3.1",
 * "Eq. (3.2)", become the assembly's own number, without parentheses.
 */
export function renumberEquationRefs(text: string, map: ReadonlyMap<string, string>): string {
  return text.replace(/\b(Equations?|Eqs?\.|Eqn\.?)\s*\(\s*(\d+\.\d+)\s*\)|\b(Equations?|Eqs?\.|Eqn\.?)\s+(\d+\.\d+)\b/gi, (_m, w1, n1, w2, n2) => {
    const word = (w1 ?? w2) as string;
    const n = (n1 ?? n2) as string;
    return `${word} ${map.get(n) ?? n}`;
  });
}

/** The "3.1" / "(3.1)" the model put at the end of an equation line, and the line without it. */
export function splitEquationNumber(line: string): { text: string; number: string | null } {
  const m = /^(.*?\S)\s+(?:\(\s*(\d+\.\d+)\s*\)|(\d+\.\d+))\s*$/.exec(line.trim());
  if (!m) return { text: line.trim(), number: null };
  // "x = 3.1" is a value, not a number label: only strip when something is left that still has an "=".
  if (!/[=≈≤≥<>]/.test(m[1])) return { text: line.trim(), number: null };
  if (m[3] && /[=≈≤≥<>]\s*$/.test(m[1])) return { text: line.trim(), number: null };
  return { text: m[1], number: m[2] ?? m[3] };
}

// ─── Placeholders ────────────────────────────────────────────────────────────

const PLACEHOLDER = /\[(?:DATA NOT PROVIDED[^\]]*|OBJECTIVE NOT MET[^\]]*|CASE TO BE SUPPLIED|ARCHIVE TO BE SUPPLIED|FIGURE PLACEHOLDER:[^\]]*|[A-Z][A-Z' ]{2,} TO BE SUPPLIED|N_DISTRIBUTED|N_RETURNED|N_USABLE|RESPONSE_RATE|POPULATION_SIZE|SAMPLE_SIZE|FIELDWORK_PERIOD)\]|p\. \[page\]/g;

/**
 * D7b: blanks left in the Claude-written preliminary pages, i.e. any [CAPITALISED] token such as
 * "[SUPERVISOR_NAME]" (the page writer is given these when the order lacks the detail). Lower-case
 * brackets ("[sic]") and numbers ("[12]") are not blanks.
 */
export function writtenBlanks(...texts: string[]): string[] {
  return [...new Set(texts.flatMap((t) => t.match(/\[[A-Z][A-Z0-9_' -]{1,78}\]/g) ?? []))];
}

export function findPlaceholders(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((m) => (m[0].startsWith("[FIGURE PLACEHOLDER") ? "[FIGURE PLACEHOLDER]" : m[0]));
}

// ─── Citations and the cited-only References list ────────────────────────────

export interface Citation {
  /** The first author's surname (or an organisation), as written. */
  author: string;
  /** "2020", "2020a" or "n.d.". */
  year: string;
  raw: string;
}

export function nameKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const YEAR = /(?:1[5-9]|20)\d{2}[a-z]?|n\.d\./;

/** The first author of a name list: "Smith et al.", "Smith and Jones", "Smith & Jones", "World Health Organization [WHO]". */
function firstAuthor(names: string): string | null {
  const cleaned = names
    .replace(/^(?:e\.g\.|see(?: also)?|cf\.|as cited in|in)\s*,?\s*/i, "")
    .replace(/\[[^\]]*\]/g, "")
    .trim();
  const first = cleaned.split(/\s+(?:et\.?\s+al\b\.?|and\b|&)|,\s+(?=\p{Lu})/u)[0]?.trim() ?? "";
  if (!/\p{L}{2,}/u.test(first) || /[=<>%]|\d/.test(first)) return null;
  if (first.split(/\s+/).length > 8) return null;
  // "(Field Survey, 2026)", "(Researcher's compilation, 2026)": the source line of a table or figure, not a work.
  if (SOURCE_NOT_A_WORK.test(first)) return null;
  return first.replace(/[.,]+$/, "");
}

/**
 * A sentence often opens with a word and a comma before the authors ("However,
 * Smith, Jones and Brown (2020)", "In Nigeria, Adeyemi and Bello (2019)"): that
 * lead word is not an author.
 */
const LEAD_NOT_AN_AUTHOR =
  /^(?:However|Moreover|Furthermore|Additionally|Similarly|Likewise|Consequently|Therefore|Thus|Hence|Specifically|Notably|Conversely|Nevertheless|Nonetheless|Indeed|Recently|Earlier|Later|Accordingly|Again|Also|Finally|First|Firstly|Second|Secondly|Third|Thirdly|Overall|Here|There|Meanwhile|Elsewhere|Globally|Locally|Regionally|Nationally|Internationally|Interestingly|Importantly|Crucially|Surprisingly|Alternatively|Instead|Still|Yet|Then|Now|Today|Historically|Traditionally|Empirically|Theoretically|Conceptually|Practically|Critically|Collectively|Together|Taken|In|On|At|By|For|From|With|Within|Among|Across|Beyond|Unlike|Like|Following|According|Building|Drawing|Using|Based|Against|Despite|During|After|Before|Since|Although|While|Whereas|When|Where|As|The|A|An|This|These|That|Those|Such|Other|Several|Many|Some|Both|Each|Prior)$/;

/** The first author of a narrative name list ("A, B, and C" gives A), after any lead word. */
function listLead(names: string): string {
  if (!names.includes(",")) return names;
  const items = names.split(/\s*,\s*|\s+(?:and|&)\s+/u).map((x) => x.trim()).filter(Boolean);
  while (items.length > 1 && LEAD_NOT_AN_AUTHOR.test(items[0].split(/\s+/)[0])) items.shift();
  return items[0] ?? names;
}

const SOURCE_NOT_A_WORK = /^(?:field ?(?:survey|work|data)|researcher(?:['’]s)?(?:\s+\w+)?|author(?:['’]s)?(?:\s+\w+)?|laboratory(?:\s+\w+)?|lab(?:\s+\w+)?|spss(?:\s+\w+)?|eviews(?:\s+\w+)?|stata(?:\s+\w+)?|pilot (?:study|test)|survey(?:\s+data)?|market associations?|computed|computation|adapted|source|own computation)$/i;

/**
 * Author-date citations in a chapter: parenthetical "(Smith, 2020; Adams et
 * al., 2019)", "(Smith, 2020, 2021)", "(Smith, 2020, p. [page])", and
 * narrative "Smith (2020)", "Smith and Jones (2019)", "Okafor et al. (2021)".
 */
export function citationsIn(text: string): Citation[] {
  const out: Citation[] = [];
  const plain = text.replace(/\*/g, "");
  for (const m of plain.matchAll(/\(([^()]*?\d{4}[a-z]?[^()]*?)\)/g)) {
    for (const partRaw of m[1].split(/;\s*/)) {
      const part = partRaw.trim();
      const pm = new RegExp(`^(.*?[A-Za-z].*?),?\\s+((?:${YEAR.source})(?:\\s*,\\s*(?:${YEAR.source}))*)(?:\\s*,\\s*(?:pp?\\.|para\\.|chap\\.).*)?$`).exec(part);
      if (!pm) continue;
      const author = firstAuthor(pm[1]);
      if (!author) continue;
      for (const year of pm[2].split(/\s*,\s*/)) out.push({ author, year, raw: `(${part})` });
    }
  }
  // Names with accents and hyphens (Demirgüç-Kunt, Konté, Al-Alwan): Unicode letters throughout.
  const NAME = "\\p{Lu}[\\p{L}'’\\-‐]+";
  // A comma-separated author list, "Chidukwani, Zander, and Koutsakis (2022)" or "A, B and C (2022)",
  // is tried first, so the citation is its FIRST author, not the name next to the year (30 Sept 2026).
  const ITEM = `${NAME}(?:\\s+${NAME})?`;
  const LIST = `(?:${ITEM},\\s+){1,6}${ITEM},?\\s+(?:and|&)\\s+${ITEM}`;
  const SIMPLE = `(?:${NAME}\\s+){0,2}${NAME}(?:\\s+(?:et\\.?\\s+al\\.?|(?:and|&)\\s+${NAME}))?`;
  const narrative = new RegExp(`(?<!\\p{L})(${LIST}|${SIMPLE})\\s+\\((${YEAR.source})(?:[,;][^)]*)?\\)`, "gu");
  for (const m of plain.matchAll(narrative)) {
    const author = firstAuthor(listLead(m[1]).replace(/^(?:The|A|An|In|As|According to)\s+/, ""));
    if (!author) continue;
    // "Table 4.1 (2020)" style false positives have no letters left once stripped of known words.
    if (/^(?:Table|Figure|Equation|Chapter|Section|Appendix|Source)$/i.test(author)) continue;
    out.push({ author: author.split(/\s+/).slice(-1)[0], year: m[2], raw: m[0] });
  }
  return out;
}

export interface CitableReference {
  authors: string | null; // "Family, G.; Family2, G2."
  year: number | null;
}

function firstFamily(ref: CitableReference): string {
  const first = (ref.authors ?? "").split(";")[0]?.trim() ?? "";
  return first.split(",")[0]?.trim() ?? "";
}

function authorMatches(citedKey: string, family: string): boolean {
  const refKey = nameKey(family);
  if (!citedKey || !refKey) return false;
  if (citedKey === refKey) return true;
  // "van der Merwe" cited as "Merwe", or an organisation cited by its first words.
  const lastWord = nameKey(family.split(/\s+/).slice(-1)[0] ?? "");
  if (lastWord.length >= 4 && citedKey === lastWord) return true;
  return citedKey.length >= 6 && refKey.length >= 6 && (refKey.startsWith(citedKey) || citedKey.startsWith(refKey));
}

/**
 * Only works cited in the chapters go in the References list (founder, D7).
 * Returns the cited references (in their original order), the ones left out,
 * and every citation that matches no reference, so QA can catch a citation to
 * a work that is not on the verified list.
 */
/** The references a citation names: same year, first author's surname (D7's rule, shared with the quality gate). */
export function referencesForCitation<T extends CitableReference>(refs: T[], c: Pick<Citation, "author" | "year">): T[] {
  const year = c.year === "n.d." ? null : Number(c.year.slice(0, 4));
  const key = nameKey(c.author);
  return refs.filter((r) => (r.year ?? null) === year && authorMatches(key, firstFamily(r)));
}

const TITLE_STOP = new Set(["about", "across", "after", "among", "analysis", "between", "effect", "effects", "evidence", "from", "impact", "into", "nigeria", "nigerian", "study", "their", "these", "through", "towards", "under", "using", "which", "within", "without"]);

/** "Ibid." / "Ibid., 45.": the same work as the note before it. */
export const IBID = /^\s*\**\s*ibid\b/i;

/** A note that names a work (a year, a DOI or a link), not a note of comment. */
export function noteCitesAWork(note: string): boolean {
  return /\b(?:1[5-9]|20)\d{2}\b|\bdoi\b|10\.\d{4,}\/|https?:\/\//i.test(note);
}

/**
 * The verified references a note names: a listed author's surname with the
 * year; failing that (a Chicago short form, "Okafor, Cash, 12"), a surname with
 * a distinctive word of the title; failing that, the title's opening words.
 * "Ibid." is resolved by the caller, which knows the note before it.
 */
export function referencesForNote<T extends CitableReference & { title?: string | null }>(refs: T[], note: string): T[] {
  const plain = note.replace(/\*/g, "");
  const words = new Set(plain.split(/[^\p{L}\d'’-]+/u).map(nameKey).filter((w) => w.length >= 2));
  const years = new Set([...plain.matchAll(/\b((?:1[5-9]|20)\d{2})[a-z]?\b/g)].map((m) => Number(m[1])));
  const surnames = (r: T) => (r.authors ?? "").split(";").map((a) => nameKey(a.split(",")[0] ?? "")).filter((s) => s.length >= 2);
  const titleWords = (r: T) => (r.title ?? "").split(/[^\p{L}\d]+/u).map(nameKey).filter((w) => w.length >= 5 && !TITLE_STOP.has(w));
  const inYear = (r: T) => r.year !== null && years.has(r.year);
  const hasTitleWord = (r: T) => titleWords(r).some((w) => words.has(w));
  // A note leads with the first author: match on that first, so a co-author shared by several works
  // (the same second author on a series of papers) does not pull the others in.
  const first = refs.filter((r) => words.has(surnames(r)[0] ?? ""));
  const any = refs.filter((r) => surnames(r).some((s) => words.has(s)));
  for (const pool of [first, any]) {
    const byYear = pool.filter(inYear);
    if (byYear.length) return byYear;
    const byTitleWord = pool.filter(hasTitleWord);
    if (byTitleWord.length) return byTitleWord;
  }
  const noteKey = nameKey(plain);
  return refs.filter((r) => {
    const opening = nameKey((r.title ?? "").split(/\s+/).slice(0, 5).join(" "));
    return opening.length >= 15 && noteKey.includes(opening);
  });
}

export function citedReferences<T extends CitableReference>(refs: T[], chapterTexts: string[]): { cited: T[]; uncited: T[]; unmatched: string[] } {
  const citations = chapterTexts.flatMap(citationsIn);
  const citedSet = new Set<T>();
  const unmatched = new Set<string>();
  for (const c of citations) {
    const hit = referencesForCitation(refs, c);
    if (hit.length) hit.forEach((r) => citedSet.add(r));
    else unmatched.add(`${c.author}, ${c.year}`);
  }
  return {
    cited: refs.filter((r) => citedSet.has(r)),
    uncited: refs.filter((r) => !citedSet.has(r)),
    unmatched: [...unmatched].sort((a, b) => a.localeCompare(b)),
  };
}
