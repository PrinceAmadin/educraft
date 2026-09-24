import { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import type { AnnualReport, FinanceReport, MonthFigures, MonthlyReport, SemesterReport } from "@/lib/services/finance/reports";

/**
 * The finance report as a Word document the CFO can send on WhatsApp: plain
 * black and white, Times New Roman 12pt, one heading per section, two-column
 * tables with a light rule. Amounts are written "NGN 1,575" (a naira sign
 * does not survive every phone's fonts).
 */

const FONT = "Times New Roman";
const SIZE = 24; // half-points: 12pt

function ngn(n: number): string {
  const whole = Number.isInteger(n) ? n : Math.round(n * 100) / 100;
  return `NGN ${whole.toLocaleString("en-NG", { minimumFractionDigits: Number.isInteger(whole) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

function text(t: string, opts: { bold?: boolean; italics?: boolean } = {}): TextRun {
  return new TextRun({ text: t, font: FONT, size: SIZE, bold: opts.bold, italics: opts.italics });
}

function p(t: string, opts: { bold?: boolean; italics?: boolean; after?: number } = {}): Paragraph {
  return new Paragraph({ children: [text(t, opts)], spacing: { after: opts.after ?? 120 } });
}

function h1(t: string): Paragraph {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, children: [new TextRun({ text: t.toUpperCase(), font: FONT, size: 28, bold: true })], spacing: { after: 200 } });
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

/** A two-column figures table: label, value. */
function figures(rows: [string, string, boolean?][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([label, value, bold]) => new TableRow({ children: [cell(label, { width: 65, bold }), cell(value, { width: 35, right: true, bold })] })),
  });
}

/** A wide table with a header row. */
function grid(header: string[], rows: string[][], widths: number[]): Table {
  const head = new TableRow({ tableHeader: true, children: header.map((h, i) => cell(h, { width: widths[i], bold: true, right: i > 0 })) });
  const body = rows.map((r) => new TableRow({ children: r.map((v, i) => cell(v, { width: widths[i], right: i > 0 })) }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [head, ...body] });
}

function change(pctValue: number | null): string {
  if (pctValue == null) return "no comparison";
  if (pctValue === 0) return "unchanged";
  return `${pctValue > 0 ? "up" : "down"} ${Math.abs(pctValue)}%`;
}

function monthRows(months: MonthFigures[]): string[][] {
  return months.map((m) => [m.label, ngn(m.revenue), ngn(m.payouts.owed), ngn(m.retained), ngn(m.operatingExpenses), ngn(m.netProfit)]);
}

function monthlyBody(r: MonthlyReport): (Paragraph | Table)[] {
  const f = r.figures;
  return [
    h1(`EduCraft monthly finance report — ${r.period.label}`),
    p(`Prepared from EduCraft HQ on ${new Date().toISOString().slice(0, 10)}. Revenue is confirmed client money less refunds; payouts are what the payout engine owes on the month's completed projects; retained is EduCraft's share allocated to the four buckets.`, { after: 200 }),
    h2("Summary"),
    figures([
      ["Total revenue", ngn(f.revenue)],
      ["Refunds", ngn(f.refunds)],
      ["Total payouts owed (workers, ambassadors, executives)", ngn(f.payouts.owed)],
      ["Payouts confirmed paid", ngn(f.payouts.paid)],
      ["Net retained", ngn(f.retained), true],
      ["Operating expenses", ngn(f.operatingExpenses)],
      ["Net profit (retained less expenses)", ngn(f.netProfit), true],
      ["Projects completed", String(f.completed)],
    ]),
    h2("Payouts by leg"),
    figures([
      ["Workers (40%)", ngn(f.payouts.byLeg.WORKER)],
      ["Ambassadors (referral rate)", ngn(f.payouts.byLeg.AMBASSADOR)],
      ["Core ambassador overrides", ngn(f.payouts.byLeg.PARENT)],
      ["Head of Growth (2.5%, ambassador-driven jobs)", ngn(f.payouts.byLeg.HOG)],
      ["Chief Operating Officer (2.5%)", ngn(f.payouts.byLeg.COO)],
    ]),
    h2("Bucket balances and movements"),
    grid(
      ["Bucket", "In this month", "Out this month", "Balance", "Health"],
      r.buckets.movements.map((m) => {
        const card = r.buckets.cards.find((c) => c.bucket === m.bucket);
        return [m.label, ngn(m.inflow), ngn(m.outflow), ngn(m.balance), card ? `${card.health.percent}% of target` : ""];
      }),
      [32, 17, 17, 17, 17]
    ),
    h2("Expenses by category"),
    r.expensesByCategory.length ? figures(r.expensesByCategory.map((e) => [e.category, ngn(e.amount)] as [string, string])) : p("No operating expenses this month."),
    h2("Founder draws distributed"),
    r.founderDraws.length
      ? grid(["Recipient", "Type", "Amount"], r.founderDraws.map((d) => [d.recipient, d.drawType.replace(/_/g, " ").toLowerCase(), ngn(d.amount)]), [40, 35, 25])
      : p("No founder draws distributed this month."),
    h2("Outstanding balances"),
    figures([
      ["Projects owing a balance", String(r.outstanding.count)],
      ["Amount outstanding", ngn(r.outstanding.amount)],
      ["Overdue (more than 7 days)", `${r.outstanding.overdueCount} projects, ${ngn(r.outstanding.overdueAmount)}`],
    ]),
    h2(`Compared with ${r.previous.label}`),
    figures([
      ["Revenue", `${ngn(r.previous.revenue)} → ${ngn(f.revenue)} (${change(r.comparison.revenue)})`],
      ["Payouts owed", `${ngn(r.previous.payouts.owed)} → ${ngn(f.payouts.owed)} (${change(r.comparison.payouts)})`],
      ["Net retained", `${ngn(r.previous.retained)} → ${ngn(f.retained)} (${change(r.comparison.retained)})`],
      ["Operating expenses", `${ngn(r.previous.operatingExpenses)} → ${ngn(f.operatingExpenses)} (${change(r.comparison.operatingExpenses)})`],
      ["Net profit", `${ngn(r.previous.netProfit)} → ${ngn(f.netProfit)} (${change(r.comparison.netProfit)})`],
      ["Projects completed", `${r.previous.completed} → ${f.completed} (${change(r.comparison.completed)})`],
    ]),
  ];
}

function semesterBody(r: SemesterReport): (Paragraph | Table)[] {
  const a = r.surplus.analysis;
  const rec = r.surplus.recommendation;
  return [
    h1(`EduCraft semester finance report — ${r.period.label}`),
    p(`Prepared from EduCraft HQ on ${new Date().toISOString().slice(0, 10)}. Months to date in the semester, cumulative figures, the bucket surplus analysis and the semester bonus.`, { after: 200 }),
    h2("Month by month"),
    grid(["Month", "Revenue", "Payouts", "Retained", "Expenses", "Net profit"], monthRows(r.months), [22, 16, 16, 16, 15, 15]),
    h2("Cumulative"),
    figures([
      ["Total revenue", ngn(r.totals.revenue)],
      ["Total payouts owed", ngn(r.totals.payouts.owed)],
      ["Net retained", ngn(r.totals.retained), true],
      ["Operating expenses", ngn(r.totals.operatingExpenses)],
      ["Net profit", ngn(r.totals.netProfit), true],
      ["Projects completed", String(r.totals.completed)],
      ["Founder draws distributed this year", ngn(r.founderDrawsYearToDate)],
    ]),
    h2("Bucket surplus analysis"),
    figures([
      ["Required minimum reserve (3 months of operating cost)", ngn(a.requiredMinimum)],
      ["Operations Reserve now", ngn(r.surplus.operationsReserve)],
      ["Surplus above the minimum", ngn(a.operationsSurplus)],
      ["Released from Operations (half the surplus)", ngn(a.operationsRelease)],
      ["Founder Distribution accumulated this semester", ngn(r.surplus.founderDistributionInflows)],
      ["Already paid as monthly draws", ngn(r.surplus.founderDrawsPaid)],
      ["Available from Founder Distribution", ngn(a.founderAvailable)],
      ["Total semester bonus available", ngn(a.total), true],
      ["Each founder", ngn(a.each), true],
    ]),
    h2("Semester bonus recommendation"),
    p(
      rec
        ? rec.status === "PENDING"
          ? `Recommended: ${ngn(rec.amountEach)} each, awaiting the founder's decision.`
          : rec.status === "DISTRIBUTED"
            ? `Distributed: ${ngn(rec.amountEach)} each.`
            : `Declined: ${ngn(rec.amountEach)} each stayed in the buckets.`
        : "No recommendation has been made for this semester."
    ),
    h2("Bucket balances"),
    grid(["Bucket", "Balance", "Health"], r.bucketCards.map((c) => [c.label, ngn(c.balance), `${c.health.percent}% of target`]), [50, 25, 25]),
  ];
}

function annualBody(r: AnnualReport): (Paragraph | Table)[] {
  const ps = r.profitShare;
  return [
    h1(`EduCraft annual finance report — ${r.period.label}`),
    p(`Prepared from EduCraft HQ on ${new Date().toISOString().slice(0, 10)}. The full year, the annual profit share calculation and the tax-relevant totals.`, { after: 200 }),
    h2("Month by month"),
    grid(["Month", "Revenue", "Payouts", "Retained", "Expenses", "Net profit"], monthRows(r.months), [22, 16, 16, 16, 15, 15]),
    h2("Year summary"),
    figures([
      ["Total revenue", ngn(r.totals.revenue)],
      ["Total payouts owed", ngn(r.totals.payouts.owed)],
      ["Net retained", ngn(r.totals.retained), true],
      ["Operating expenses", ngn(r.totals.operatingExpenses)],
      ["Net profit (retained less expenses)", ngn(r.totals.netProfit), true],
      ["Projects completed", String(r.totals.completed)],
      ["Founder draws distributed", ngn(r.totals.founderDraws)],
    ]),
    h2("Expenses by category"),
    r.expensesByCategory.length ? figures(r.expensesByCategory.map((e) => [e.category, ngn(e.amount)] as [string, string])) : p("No operating expenses this year."),
    h2("Annual profit share"),
    figures([
      ["All bucket balances", ngn(ps.share.totalBalances)],
      ["Next quarter operating reserve (3 months)", ngn(ps.share.q1Reserve)],
      ["Available for profit share", ngn(ps.share.available), true],
      ["Each founder", ngn(ps.share.each), true],
      ["Status", ps.recommendation ? ps.recommendation.status.toLowerCase() : ps.open ? "not yet recommended" : "decided in December"],
    ]),
    h2("Tax-relevant totals"),
    figures([
      ["Total revenue", ngn(r.tax.totalRevenue)],
      ["Total paid out to workers, ambassadors and executives", ngn(r.tax.totalPayouts)],
      ["Total operating expenses", ngn(r.tax.totalExpenses)],
      ["Net profit", ngn(r.tax.netProfit), true],
    ]),
  ];
}

export async function buildFinanceReportDocx(report: FinanceReport): Promise<Buffer> {
  const children = report.type === "monthly" ? monthlyBody(report.data) : report.type === "semester" ? semesterBody(report.data) : annualBody(report.data);
  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [{ properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children }],
  });
  return Packer.toBuffer(doc);
}

export function reportFilename(report: FinanceReport): string {
  return `educraft-${report.type}-report-${report.data.period.key}.docx`;
}
