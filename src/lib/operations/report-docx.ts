import { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import type { OperationsReport } from "@/lib/services/operations/reports";

/**
 * The monthly operations report as a Word document — what the COO brings
 * to the monthly executive meeting. Plain black and white, Times New Roman
 * 12pt, one heading per section, tables with a light rule (same house
 * style as the finance report).
 */

const FONT = "Times New Roman";
const SIZE = 24; // half-points: 12pt

function text(t: string, opts: { bold?: boolean; italics?: boolean } = {}): TextRun {
  return new TextRun({ text: t, font: FONT, size: SIZE, bold: opts.bold, italics: opts.italics });
}

function p(t: string, opts: { bold?: boolean; italics?: boolean; after?: number } = {}): Paragraph {
  return new Paragraph({ children: [text(t, opts)], spacing: { after: opts.after ?? 120 } });
}

function h1(t: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: t.toUpperCase(), font: FONT, size: 28, bold: true })],
    spacing: { after: 200 },
  });
}

function h2(t: string): Paragraph {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: t, font: FONT, size: SIZE, bold: true })], spacing: { before: 240, after: 120 } });
}

const RULE = { style: BorderStyle.SINGLE, size: 4, color: "BBBBBB" };
const NO_RULE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

function cell(t: string, opts: { bold?: boolean; right?: boolean; width: number }): TableCell {
  return new TableCell({
    width: { size: opts.width, type: WidthType.PERCENTAGE },
    borders: { top: NO_RULE, left: NO_RULE, right: NO_RULE, bottom: RULE },
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [new Paragraph({ alignment: opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [text(t, { bold: opts.bold })] })],
  });
}

function grid(header: string[], rows: string[][], widths: number[]): Table {
  const head = new TableRow({ tableHeader: true, children: header.map((h, i) => cell(h, { width: widths[i], bold: true, right: i > 0 })) });
  const body = rows.map((r) => new TableRow({ cantSplit: true, children: r.map((v, i) => cell(v, { width: widths[i], right: i > 0 })) }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [head, ...body] });
}

const pct = (v: number | null) => (v == null ? "n/a" : `${v}%`);
const days = (v: number | null) => (v == null ? "n/a" : `${v} days`);
const verdict = (ok: boolean | null) => (ok == null ? "" : ok ? "on target" : "below target");

export function operationsReportDocx(r: OperationsReport): Promise<Buffer> {
  const k = r.kpis;
  const children: (Paragraph | Table)[] = [
    h1(`EduCraft monthly operations report — ${r.monthLabel}`),
    p(
      `Prepared from EduCraft HQ on ${new Date(r.generatedAt).toISOString().slice(0, 10)}. On-time delivery counts projects delivered on or before their internal deadline; QA first-pass counts projects approved without a revision; supervisor acceptance counts delivered projects that never came back for corrections.`,
      { after: 200 }
    ),
    h2("Headline"),
    grid(
      ["Measure", "This month", "Target", "Verdict"],
      [
        ["On-time delivery", `${pct(k.onTime.value)} (${k.onTime.count} of ${k.onTime.total})`, `${k.onTime.target}%`, verdict(k.onTime.ok)],
        ["QA first-pass rate", `${pct(k.qaFirstPass.value)} (${k.qaFirstPass.count} of ${k.qaFirstPass.total})`, `${k.qaFirstPass.target}%`, verdict(k.qaFirstPass.ok)],
        ["Supervisor acceptance", `${pct(k.supervisorAccept.value)} (${k.supervisorAccept.count} of ${k.supervisorAccept.total})`, `${k.supervisorAccept.target}%`, verdict(k.supervisorAccept.ok)],
        ["Projects completed", String(k.completed.value), `${k.completed.lastMonth} last month`, k.completed.value >= k.completed.lastMonth ? "up or level" : "down"],
        ["Projects delivered", String(k.completed.delivered), "", ""],
      ],
      [34, 30, 18, 18]
    ),
    h2("Time in each status"),
    grid(
      ["Step", "Average", "Target", "Verdict"],
      r.timing.map((t) => [t.label, t.avgDays == null ? "n/a" : `${days(t.avgDays)} (${t.samples})`, t.targetDays == null ? "by deadline" : days(t.targetDays), verdict(t.ok)]),
      [40, 22, 20, 18]
    ),
    h2("Worker performance"),
  ];

  if (r.league.length === 0) {
    children.push(p("No projects were delivered this month."));
  } else {
    children.push(
      grid(
        ["Rank", "Worker", "Projects", "On-time", "QA pass", "Sup. accept", "Flags", "Status"],
        r.league.map((w) => [String(w.rank), w.name, String(w.projects), pct(w.onTimeRate), pct(w.qaFirstPassRate), pct(w.supervisorAcceptRate), String(w.flags), w.label]),
        [8, 28, 11, 11, 11, 13, 8, 10]
      )
    );
    if (r.star) children.push(p(`Monthly star: ${r.star.name} — ${r.star.summary}.`, { italics: true }));
  }

  children.push(h2("Projects by department"));
  if (r.departments.length === 0) {
    children.push(p("No deliveries this month."));
  } else {
    children.push(
      grid(
        ["Department", "Projects", "Average delivery", "On-time"],
        r.departments.map((d) => [d.department, String(d.projects), days(d.avgDeliveryDays), `${pct(d.onTimeRate)}${d.belowTarget ? " (below target)" : ""}`]),
        [40, 15, 25, 20]
      )
    );
    const below = r.departments.filter((d) => d.belowTarget);
    if (below.length) {
      children.push(p(`${below.map((d) => d.department).join(", ")}: delivery is below target — check whether the workload is too high for the workers qualified in ${below.length === 1 ? "that department" : "those departments"}.`));
    }
  }

  const c = r.corrections;
  const share = (n: number) => (c.delivered ? ` (${Math.round((n / c.delivered) * 100)}%)` : "");
  children.push(
    h2("Supervisor corrections"),
    grid(
      ["", "Projects"],
      [
        ["Total projects delivered", String(c.delivered)],
        ["With no corrections", `${c.zero}${share(c.zero)}`],
        ["With one round", `${c.one}${share(c.one)}`],
        ["With two or more rounds", `${c.twoPlus}${share(c.twoPlus)}`],
      ],
      [70, 30]
    )
  );
  if (c.items.length) {
    children.push(
      grid(
        ["Project", "Worker", "Department", "Rounds", "Status"],
        c.items.map((i) => [i.projectCode, i.workerName ?? "—", i.department, String(i.rounds), i.status]),
        [18, 26, 26, 12, 18]
      )
    );
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [{ properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children }],
  });
  return Packer.toBuffer(doc);
}
