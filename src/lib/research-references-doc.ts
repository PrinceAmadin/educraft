/**
 * The project's reference list as a Word document, for the writer and for
 * clients who ask for it: every kept reference, de-duplicated, alphabetical,
 * in the project's referencing style. Plain black and white — Times New Roman
 * 12pt, double spaced, justified, 1 inch margins, hanging indent, journal
 * names and "et al." italicised, no colour, links or header/footer.
 */
import { AlignmentType, Document, HeadingLevel, LineRuleType, Packer, Paragraph, TextRun } from "docx";

export interface DocReference {
  title: string | null;
  proposedTitle: string;
  authors: string | null; // "Family, G.; Family2, G2."
  year: number | null;
  journal: string | null;
  doi: string | null;
}

type ReferencingStyle = "APA_7TH" | "APA_6TH" | "HARVARD" | "IEEE" | "CHICAGO" | "MLA" | "CUSTOM";
type Seg = { text: string; italics?: boolean };

const ET_AL: Seg = { text: "et al.", italics: true };

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const ACRONYMS = new Set(["AI", "IT", "ICT", "IoT", "SME", "SMEs", "ML", "API", "IEEE", "NIST", "GDPR", "DDoS", "USA", "UK", "COVID", "COVID-19", "VPN", "IoMT", "OT", "IS", "ISO"]);
const SMALL = new Set(["a", "an", "the", "of", "in", "on", "for", "and", "or", "to", "at", "by", "with", "from", "as", "vs", "via", "nor", "but"]);

/** Text that is mostly capitals (a publisher's shouting title) becomes Title Case; anything else is left as published. */
function unshout(s: string): string {
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (letters.length < 4 || letters.replace(/[^A-Z]/g, "").length / letters.length < 0.6) return s;
  let afterColon = true;
  return s
    .split(/(\s+)/)
    .map((w, i) => {
      if (/^\s*$/.test(w)) return w;
      const bare = w.replace(/[^A-Za-z0-9-]/g, "");
      const acr = [...ACRONYMS].find((a) => a.toUpperCase() === bare.toUpperCase());
      const first = i === 0 || afterColon;
      afterColon = /[:?]$/.test(w);
      if (acr) return w.replace(bare, acr);
      const lower = w.toLowerCase();
      if (!first && SMALL.has(bare.toLowerCase())) return lower;
      return lower.replace(/(^|[-(/"'])([a-z])/g, (_m, p, c) => p + c.toUpperCase());
    })
    .join("");
}

const titleOf = (r: DocReference) => unshout(clean(r.title ?? r.proposedTitle).replace(/[.\s]+$/, ""));

/** "ABRAHAMS, T." → "Abrahams, T." — only the surname is touched, and only when it is all capitals. */
function fixSurname(a: string): string {
  const i = a.indexOf(",");
  const surname = i === -1 ? a : a.slice(0, i);
  if (surname.length < 4 || surname !== surname.toUpperCase()) return a;
  return unshout(surname) + (i === -1 ? "" : a.slice(i));
}
const authorList = (r: DocReference) => (r.authors ?? "").split(";").map(clean).filter(Boolean).map(fixSurname);

/** "Bada, M. J." → "M. J. Bada" (IEEE order). */
function initialsFirst(a: string): string {
  const [surname, initials] = a.split(/,\s*/);
  return initials ? `${initials} ${surname}` : surname;
}

function key(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Same DOI, or failing that the same title and year, is the same work. */
export function dedupeReferences<T extends DocReference>(refs: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of refs) {
    const ids = [r.doi ? `doi:${r.doi.toLowerCase()}` : null, `t:${key(titleOf(r))}|${r.year ?? ""}`].filter(
      (k): k is string => Boolean(k),
    );
    if (ids.some((id) => seen.has(id))) continue;
    ids.forEach((id) => seen.add(id));
    out.push(r);
  }
  return out;
}

function sortAlphabetically<T extends DocReference>(refs: T[]): T[] {
  const sortKey = (r: T) => `${key(authorList(r).join(" ")) || key(titleOf(r))}|${r.year ?? 0}|${key(titleOf(r))}`;
  return [...refs].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

/** "A", "A and B", "A, B, and C" — `last` is the connector before the final name. */
function join(names: string[], sep: string, last: string, pair = last): string {
  if (names.length <= 1) return names.join("");
  if (names.length === 2) return `${names[0]}${pair}${names[1]}`;
  return `${names.slice(0, -1).join(sep)}${last}${names[names.length - 1]}`;
}

function format(style: ReferencingStyle, r: DocReference, n: number): Seg[] {
  const authors = authorList(r);
  const title = titleOf(r);
  const year = r.year ? String(r.year) : "n.d.";
  const journal = r.journal ? unshout(clean(r.journal)) : null;
  const url = r.doi ? `https://doi.org/${r.doi}` : "";
  const t = (text: string): Seg => ({ text });
  const j = (text: string): Seg => ({ text, italics: true });

  switch (style) {
    case "APA_6TH": {
      const names =
        authors.length > 7
          ? `${authors.slice(0, 6).join(", ")}, . . . ${authors[authors.length - 1]}`
          : join(authors, ", ", ", & ");
      return [
        t(`${names} (${year}). ${title}. `),
        ...(journal ? [j(journal), t(". ")] : []),
        ...(r.doi ? [t(`doi:${r.doi}`)] : []),
      ];
    }
    case "HARVARD": {
      const head = authors.length > 3 ? [t(`${authors[0]} `), ET_AL] : [t(join(authors, ", ", " and "))];
      return [
        ...head,
        t(` (${year}) '${title}', `),
        ...(journal ? [j(journal), t(". ")] : []),
        ...(url ? [t(`Available at: ${url}.`)] : []),
      ];
    }
    case "IEEE": {
      const names = authors.map(initialsFirst);
      const head = names.length > 6 ? [t(`${names[0]} `), ET_AL] : [t(join(names, ", ", ", and ", " and "))];
      return [
        t(`[${n}] `),
        ...head,
        t(`, "${title}," `),
        ...(journal ? [j(journal), t(", ")] : []),
        t(`${year}${r.doi ? `, doi: ${r.doi}` : ""}.`),
      ];
    }
    case "CHICAGO": {
      const head =
        authors.length > 10
          ? [t(`${authors.slice(0, 7).join(", ")}, `), ET_AL]
          : [t(join(authors.map((a, i) => (i === 0 ? a : initialsFirst(a))), ", ", ", and "))];
      return [
        ...head,
        t(`${stop(head)} ${year}. "${title}." `),
        ...(journal ? [j(journal), t(". ")] : []),
        ...(url ? [t(`${url}.`)] : []),
      ];
    }
    case "MLA": {
      const first = authors[0] ?? "";
      const head =
        authors.length > 2
          ? [t(`${first}, `), ET_AL]
          : [t(authors.length === 2 ? `${first}, and ${initialsFirst(authors[1])}` : first)];
      return [
        ...head,
        t(`${stop(head)} "${title}." `),
        ...(journal ? [j(journal), t(", ")] : []),
        t(`${year}${url ? `, ${url}` : ""}.`),
      ];
    }
    default: {
      // APA 7th, also the fallback for a custom style.
      const names =
        authors.length > 20
          ? `${authors.slice(0, 19).join(", ")}, . . . ${authors[authors.length - 1]}`
          : join(authors, ", ", ", & ");
      return [
        t(`${names} (${year}). ${title}. `),
        ...(journal ? [j(journal), t(". ")] : []),
        ...(url ? [t(url)] : []),
      ];
    }
  }
}

/** Full stop after a name list, unless it already ends in "et al.". */
const stop = (head: Seg[]) => (head[head.length - 1] === ET_AL ? "" : ".");

/** Italicises "et al." wherever it appears, as well as any segment flagged italic. */
function runs(segs: Seg[]): TextRun[] {
  const out: TextRun[] = [];
  for (const seg of segs) {
    if (seg.italics) {
      out.push(new TextRun({ text: seg.text, italics: true }));
      continue;
    }
    seg.text.split(/(et al\.)/).forEach((part) => {
      if (part) out.push(new TextRun({ text: part, italics: part === "et al." }));
    });
  }
  return out;
}

export async function buildReferencesDocx(refs: DocReference[], style: ReferencingStyle | null): Promise<Buffer> {
  const list = sortAlphabetically(dedupeReferences(refs));
  const font = { ascii: "Times New Roman", hAnsi: "Times New Roman", cs: "Times New Roman", eastAsia: "Times New Roman" };
  const spacing = { line: 480, lineRule: LineRuleType.AUTO, before: 0, after: 0 };

  const doc = new Document({
    creator: "EduCraft",
    title: "References",
    styles: {
      default: { document: { run: { font, size: 24, color: "000000" }, paragraph: { spacing } } },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font, size: 24, bold: true, color: "000000" },
          paragraph: { alignment: AlignmentType.CENTER, spacing, outlineLevel: 0 },
        },
      ],
    },
    sections: [
      {
        properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing,
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: "REFERENCES", bold: true })],
          }),
          ...list.map(
            (r, i) =>
              new Paragraph({
                alignment: AlignmentType.JUSTIFIED,
                spacing,
                indent: { left: 720, hanging: 720 },
                children: runs(format(style ?? "APA_7TH", r, i + 1)),
              }),
          ),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
