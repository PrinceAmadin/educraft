import { jsPDF } from "jspdf";
import type { WeeklyStatement } from "@/lib/finance/statement-rules";

/**
 * Render a weekly financial statement to PDF (Phase 7). Mirrors receipts.ts:
 * jsPDF, points/A4, helvetica + courier, RGB tuples, "NGN 1,575" (the standard
 * fonts have no naira sign), rendered from the stored statement data.
 */

const TEAL: [number, number, number] = [13, 148, 136];
const INK: [number, number, number] = [15, 23, 42];
const MUTED: [number, number, number] = [100, 116, 139];
const RULE: [number, number, number] = [232, 234, 237];

const ngn = (n: number) => `NGN ${Math.round(n).toLocaleString("en-NG")}`;

export function statementFilename(data: WeeklyStatement): string {
  return `educraft-statement-${data.isoWeek}.pdf`;
}

export function buildStatementPdf(data: WeeklyStatement, hq: { phone: string; email: string }): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const left = 48;
  const right = 547;
  let y = 56;

  const text = (s: string, x: number, size = 10, color = INK, font: "helvetica" | "courier" = "helvetica", style: "normal" | "bold" = "normal") => {
    doc.setFont(font, style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(s, x, y);
  };
  const rightText = (s: string, size = 10, color = INK, font: "helvetica" | "courier" = "courier") => {
    doc.setFont(font, "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(s, right, y, { align: "right" });
  };
  const rule = () => {
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.5);
    doc.line(left, y, right, y);
  };
  const section = (title: string) => {
    y += 24;
    text(title, left, 8, TEAL, "helvetica", "bold");
    y += 6;
    rule();
    y += 14;
  };
  const row = (label: string, value: string, strong = false) => {
    text(label, left, 10, strong ? INK : MUTED, "helvetica", strong ? "bold" : "normal");
    rightText(value, 10, INK, "courier");
    y += 16;
  };
  const pageBreak = () => {
    if (y > 770) {
      doc.addPage();
      y = 56;
    }
  };

  // Header
  text("EduCraft — Weekly financial statement", left, 15, INK, "helvetica", "bold");
  y += 18;
  text(data.label, left, 11, MUTED);
  y += 24;

  // Headline figures
  row("Revenue (net)", ngn(data.revenue.net), true);
  row("Commissions accrued", ngn(data.commissions.total));
  row("Paid out", ngn(data.payouts.total));
  row("Cash position", ngn(data.position), true);
  row("Outstanding owed", ngn(data.outstanding));

  section("Revenue");
  row("Downpayments", ngn(data.revenue.downpayments));
  row("Balances", ngn(data.revenue.balances));
  row("Refunds out", ngn(-data.revenue.refundsOut));
  row("Net revenue", ngn(data.revenue.net), true);
  if (data.revenue.byProject.length) {
    y += 6;
    for (const p of data.revenue.byProject.slice(0, 20)) {
      pageBreak();
      row(`${p.projectCode} — ${p.clientName}`, ngn(p.amount));
    }
  }

  section("Commissions accrued this week");
  if (data.commissions.groups.length === 0) row("None", ngn(0));
  for (const g of data.commissions.groups) {
    pageBreak();
    row(`${g.label} (${g.count})`, ngn(g.amount));
  }

  section("Paid out this week");
  if (data.payouts.batches.length === 0 && data.payouts.founderDraws.length === 0) row("None", ngn(0));
  for (const b of data.payouts.batches) {
    pageBreak();
    row(`${b.cohort} ${b.periodKey} (${b.recipientCount})`, ngn(b.amount));
  }
  for (const d of data.payouts.founderDraws) {
    pageBreak();
    row(`Founder draw — ${d.recipient} (${d.drawType})`, ngn(d.amount));
  }

  section("Pot movements");
  row("", "open   in    out   close");
  for (const p of data.pots.byPot) {
    pageBreak();
    text(p.label, left, 10, MUTED);
    rightText(`${ngn(p.opening)}  +${ngn(p.in)}  -${ngn(p.out)}  = ${ngn(p.closing)}`, 8, INK, "courier");
    y += 16;
  }
  row("All pots", `${ngn(data.pots.opening)}  +${ngn(data.pots.in)}  -${ngn(data.pots.out)}  = ${ngn(data.pots.closing)}`, true);

  if (data.refunds.count > 0) {
    section("Refunds");
    for (const x of data.refunds.items) {
      pageBreak();
      row(`${x.projectCode} (stage ${x.stage}) — ${x.reason}`.slice(0, 70), ngn(x.amount));
    }
  }

  section("Bucket health (week end)");
  for (const b of data.buckets) {
    pageBreak();
    row(`${b.label} — ${b.health.level} (${b.health.percent}%)`, ngn(b.balance));
  }

  if (data.notes) {
    section("Notes");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    for (const line of doc.splitTextToSize(data.notes, right - left)) {
      pageBreak();
      doc.text(line, left, y);
      y += 14;
    }
  }

  // Footer
  y = Math.max(y + 24, 800);
  rule();
  y += 14;
  text("EduCraft — Providing Affordable Academic Services", left, 8, MUTED);
  y += 12;
  text(`${hq.phone} · ${hq.email}`, left, 8, MUTED);

  return Buffer.from(doc.output("arraybuffer"));
}
