import ExcelJS from "exceljs";
import type { WeeklyStatement } from "@/lib/finance/statement-rules";

/**
 * Render a weekly financial statement to an .xlsx workbook (Phase 7). exceljs
 * is a direct dependency (read-only elsewhere); this authors the workbook and
 * returns a Buffer, from the stored statement data.
 */

export function statementXlsxFilename(data: WeeklyStatement): string {
  return `educraft-statement-${data.isoWeek}.xlsx`;
}

export async function buildStatementXlsx(data: WeeklyStatement): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "EduCraft HQ";

  const money = (ws: ExcelJS.Worksheet, col: string) => {
    ws.getColumn(col).numFmt = "#,##0";
  };
  const header = (ws: ExcelJS.Worksheet, cols: string[]) => {
    const row = ws.addRow(cols);
    row.font = { bold: true };
  };

  const summary = wb.addWorksheet("Summary");
  summary.columns = [{ width: 28 }, { width: 18 }];
  summary.addRow([`Weekly financial statement`]);
  summary.getRow(1).font = { bold: true, size: 14 };
  summary.addRow([data.label]);
  summary.addRow([]);
  for (const [label, value] of [
    ["Revenue (net)", data.revenue.net],
    ["Downpayments", data.revenue.downpayments],
    ["Balances", data.revenue.balances],
    ["Refunds out", data.revenue.refundsOut],
    ["Commissions accrued", data.commissions.total],
    ["Paid out", data.payouts.total],
    ["Cash position", data.position],
    ["Outstanding owed", data.outstanding],
  ] as const) {
    summary.addRow([label, value]);
  }
  money(summary, "B");

  const rev = wb.addWorksheet("Revenue");
  rev.columns = [{ width: 16 }, { width: 28 }, { width: 16 }];
  header(rev, ["Project", "Client", "Amount"]);
  for (const p of data.revenue.byProject) rev.addRow([p.projectCode, p.clientName, p.amount]);
  money(rev, "C");

  const comm = wb.addWorksheet("Commissions");
  comm.columns = [{ width: 24 }, { width: 10 }, { width: 16 }];
  header(comm, ["Recipient group", "Count", "Accrued"]);
  for (const g of data.commissions.groups) comm.addRow([g.label, g.count, g.amount]);
  money(comm, "C");

  const pay = wb.addWorksheet("Paid out");
  pay.columns = [{ width: 16 }, { width: 14 }, { width: 12 }, { width: 16 }];
  header(pay, ["Kind", "Period/Recipient", "Count", "Amount"]);
  for (const b of data.payouts.batches) pay.addRow([b.cohort, b.periodKey, b.recipientCount, b.amount]);
  for (const d of data.payouts.founderDraws) pay.addRow([`Founder draw (${d.drawType})`, d.recipient, "", d.amount]);
  money(pay, "D");

  const pots = wb.addWorksheet("Pots");
  pots.columns = [{ width: 18 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 14 }];
  header(pots, ["Pot", "Opening", "In", "Out", "Closing"]);
  for (const p of data.pots.byPot) pots.addRow([p.label, p.opening, p.in, p.out, p.closing]);
  pots.addRow(["All pots", data.pots.opening, data.pots.in, data.pots.out, data.pots.closing]).font = { bold: true };
  ["B", "C", "D", "E"].forEach((c) => money(pots, c));

  if (data.refunds.count > 0) {
    const ref = wb.addWorksheet("Refunds");
    ref.columns = [{ width: 16 }, { width: 10 }, { width: 16 }, { width: 40 }];
    header(ref, ["Project", "Stage", "Amount", "Reason"]);
    for (const x of data.refunds.items) ref.addRow([x.projectCode, x.stage, x.amount, x.reason]);
    money(ref, "C");
  }

  const buckets = wb.addWorksheet("Buckets");
  buckets.columns = [{ width: 22 }, { width: 16 }, { width: 12 }, { width: 10 }];
  header(buckets, ["Bucket", "Balance (week end)", "Health", "Percent"]);
  for (const b of data.buckets) buckets.addRow([b.label, b.balance, b.health.level, b.health.percent]);
  money(buckets, "B");

  if (data.notes) {
    const notes = wb.addWorksheet("Notes");
    notes.columns = [{ width: 90 }];
    notes.addRow([data.notes]);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
