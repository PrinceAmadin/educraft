import { jsPDF } from "jspdf";
import type { ReceiptData } from "@/lib/services/client-portal";

/**
 * A one-page A4 receipt for a confirmed client payment. The standard PDF fonts
 * have no naira sign, so amounts print as "NGN 1,575". Only confirmed payments
 * ever reach this (see getReceiptData), and never a payment's internal notes.
 */

const TEAL: [number, number, number] = [13, 148, 136];
const INK: [number, number, number] = [15, 23, 42];
const MUTED: [number, number, number] = [100, 116, 139];
const RULE: [number, number, number] = [232, 234, 237];

const ngn = (n: number) => `NGN ${Math.round(n).toLocaleString("en-NG")}`;
const day = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });

export function buildReceiptPdf(r: ReceiptData): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const left = 56;
  const right = 539;
  let y = 72;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(...TEAL);
  doc.text("EduCraft", left, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("Providing Affordable Academic Services", left, y + 16);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...INK);
  doc.text("RECEIPT", right, y - 6, { align: "right" });
  doc.setFont("courier", "normal");
  doc.setFontSize(10);
  doc.text(r.receiptNo, right, y + 10, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text(day(r.date), right, y + 24, { align: "right" });

  y += 48;
  doc.setDrawColor(...RULE);
  doc.line(left, y, right, y);

  // Parties
  y += 32;
  const label = (text: string, x: number, at: number, align: "left" | "right" = "left") => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(text.toUpperCase(), x, at, { align });
  };
  const value = (text: string, x: number, at: number, mono = false) => {
    doc.setFont(mono ? "courier" : "helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(text, x, at);
  };

  label("Received from", left, y);
  value(r.clientName, left, y + 16);
  value(`Client ID ${r.clientId}`, left, y + 32, true);

  label("For project", 300, y);
  value(r.projectCode, 300, y + 16, true);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  const titleLines = doc.splitTextToSize(r.projectTitle, right - 300) as string[];
  doc.text(titleLines.slice(0, 3), 300, y + 32);
  const titleHeight = Math.min(titleLines.length, 3) * 14;
  doc.setTextColor(...MUTED);
  doc.setFontSize(10);
  doc.text(r.serviceName, 300, y + 36 + titleHeight);

  // Line item
  y += 72 + titleHeight;
  doc.setFillColor(241, 243, 245);
  doc.rect(left, y, right - left, 26, "F");
  label("Description", left + 12, y + 17);
  label("Amount", right - 12, y + 17, "right");
  doc.setFontSize(9);
  y += 26;
  y += 24;
  value(r.leg === "balance" ? "Balance payment" : "Downpayment", left + 12, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(ngn(r.amount), right - 12, y, { align: "right" });
  y += 16;
  doc.setDrawColor(...RULE);
  doc.line(left, y, right, y);

  // Totals
  const total = (text: string, amount: string, at: number, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(10);
    doc.setTextColor(...(bold ? INK : MUTED));
    doc.text(text, 330, at);
    doc.setTextColor(...INK);
    doc.text(amount, right - 12, at, { align: "right" });
  };
  y += 24;
  total("Project price", ngn(r.price), y);
  total("Paid to date", ngn(r.paidToDate), y + 18);
  total(r.remaining > 0 ? "Balance remaining" : "Fully paid", r.remaining > 0 ? ngn(r.remaining) : ngn(0), y + 36, true);

  // Payment details
  y += 72;
  label("Paid by", left, y);
  value(r.method ?? "Bank transfer", left, y + 16);
  if (r.reference) {
    label("Reference", 300, y);
    doc.setFont("courier", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(doc.splitTextToSize(r.reference, right - 300) as string[], 300, y + 16);
  }

  // Footer
  doc.setDrawColor(...RULE);
  doc.line(left, 770, right, 770);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("Thank you for choosing EduCraft.", left, 788);
  doc.text("07063421088  |  educraft611@gmail.com", right, 788, { align: "right" });

  return Buffer.from(doc.output("arraybuffer"));
}
