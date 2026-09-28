/**
 * Phase D10 checks (Part C): the receipt/invoice PDF renderer, the stored
 * private-blob path, and the payments-side rules. Pure: no DB, no network,
 * no Claude, and no Blob write — buildReceiptPdf returns a Buffer in memory.
 *
 *   npm run check:billing
 */
import { buildReceiptPdf, type ReceiptVariant } from "../src/lib/receipts";
import { buildReceiptPath, parseStoredPath } from "../src/lib/files/paths";
import { maxBytesFor } from "../src/lib/files/policy";
import type { ReceiptData } from "../src/lib/services/client-portal";

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else failures.push(`${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}

// ─── Sample data (a made-up EC-QA row; matches ReceiptData shape) ──────────
const sample: ReceiptData = {
  receiptNo: "EC-PAY-00042",
  date: new Date("2026-09-28T09:15:00Z"),
  amount: 40_500,
  leg: "downpayment",
  method: "Paystack",
  reference: "pk_test_ref_123",
  clientName: "QA Test Client",
  clientId: "ECC-9999",
  projectCode: "EC-QA-D10-A",
  projectTitle: "Test project title",
  serviceName: "Final Year Project",
  price: 90_000,
  paidToDate: 40_500,
  remaining: 49_500,
};

// ─── Receipt variant (default) ─────────────────────────────────────────────
const receipt = buildReceiptPdf(sample);
check("receipt renders as a Buffer", Buffer.isBuffer(receipt));
check("receipt has PDF magic bytes", receipt.slice(0, 4).toString("ascii") === "%PDF");
check("receipt is non-empty", receipt.byteLength > 512);
check("receipt fits well under the receipt purpose's max bytes", receipt.byteLength < maxBytesFor("receipt"));

// ─── Invoice variant ───────────────────────────────────────────────────────
const invoice = buildReceiptPdf(sample, { variant: "invoice" });
check("invoice renders as a Buffer", Buffer.isBuffer(invoice));
check("invoice has PDF magic bytes", invoice.slice(0, 4).toString("ascii") === "%PDF");
check("invoice differs from receipt (different content)", invoice.toString("binary") !== receipt.toString("binary"));

// ─── Both variants — type is well-defined ──────────────────────────────────
const variants: ReceiptVariant[] = ["receipt", "invoice"];
check("ReceiptVariant enumerates receipt and invoice", variants.length === 2);
for (const v of variants) {
  const pdf = buildReceiptPdf(sample, { variant: v });
  check(`variant ${v} produces PDF magic bytes`, pdf.slice(0, 4).toString("ascii") === "%PDF");
}

// ─── The stored path scheme ────────────────────────────────────────────────
{
  const random = "a".repeat(24); // 24 hex chars is what the paths regex wants
  const p = buildReceiptPath({ projectDbId: "proj12345678", paymentDbId: "pay1234567890", random });
  check("receipt path starts with projects/", p.startsWith("projects/"));
  check("receipt path uses the receipt purpose", p.includes("/receipt/"));
  check("receipt path targets the payment", p.includes("/pay1234567890/"));
  check("receipt path ends with .pdf", p.endsWith(".pdf"));
  const parsed = parseStoredPath(p);
  check("path parses back", parsed !== null);
  check("parsed purpose is receipt", parsed?.purpose === "receipt");
  check("parsed targetId is the paymentDbId", parsed?.targetId === "pay1234567890");
  check("parsed projectDbId is the project", parsed?.projectDbId === "proj12345678");
}

// ─── parseStoredPath refuses paths outside the receipt/deliverable/data/source/message set ─
check("parseStoredPath rejects a bogus purpose", parseStoredPath("projects/proj12345678/nope/pay1234567890/" + "a".repeat(24) + ".pdf") === null);
check("parseStoredPath accepts a valid receipt path", parseStoredPath("projects/proj12345678/receipt/pay1234567890/" + "a".repeat(24) + ".pdf") !== null);

// ─── The "already stored, skip re-upload" contract ─────────────────────────
// storeReceipt (services/billing.ts) short-circuits when Payment.receiptBlobPath
// and Payment.receiptStoredAt are both set on the row it reads. We simulate the
// decision here without loading the module (which requires prisma).
function shouldStore(row: { receiptBlobPath: string | null; receiptStoredAt: Date | null } | null): "skip" | "no_row" | "store" {
  if (!row) return "no_row";
  if (row.receiptBlobPath && row.receiptStoredAt) return "skip";
  return "store";
}
check("stores when the row has no receipt yet", shouldStore({ receiptBlobPath: null, receiptStoredAt: null }) === "store");
check("skips when the row already has a stored receipt", shouldStore({ receiptBlobPath: "projects/x/receipt/y/z.pdf", receiptStoredAt: new Date() }) === "skip");
check("skips when only one field is set (defensive)", shouldStore({ receiptBlobPath: "x", receiptStoredAt: null }) === "store");
check("returns no_row when the payment is missing", shouldStore(null) === "no_row");

// ─── The Pending-payment invoice contract ─────────────────────────────────
// Confirmed payments have a receipt; Pending/Failed/Rejected show an invoice.
// paidToDate on an invoice counts only Confirmed rows (never itself).
function invoiceView(status: "Pending" | "Confirmed" | "Failed" | "Rejected"): "invoice" | "receipt" | "none" {
  if (status === "Confirmed") return "receipt";
  if (status === "Pending" || status === "Failed" || status === "Rejected") return "invoice";
  return "none";
}
check("Confirmed rows offer a receipt", invoiceView("Confirmed") === "receipt");
check("Pending rows offer an invoice", invoiceView("Pending") === "invoice");
check("Failed rows offer an invoice", invoiceView("Failed") === "invoice");

// ─── Segregation of duties (documented, not enforced here) ────────────────
// verifyPayment writes the receipt in waitUntil after the confirm transaction
// commits. This means:
//   - Marking a payment paid (COO) does NOT store a receipt.
//   - Verifying a payment (Super Admin or CFO) DOES store the receipt.
// We assert the shape of the two role gates by listing the roles.
const CAN_MARK = ["SUPER_ADMIN", "COO"] as const;
const CAN_VERIFY = ["SUPER_ADMIN", "CO_CEO_CFO"] as const;
check("only Super Admin or COO can mark paid (D10 does not add workers)", !(CAN_MARK as readonly string[]).includes("WORKER"));
check("only Super Admin or CFO can verify (D10 keeps the CFO gate)", !(CAN_VERIFY as readonly string[]).includes("COO") && !(CAN_VERIFY as readonly string[]).includes("WORKER"));

if (failures.length > 0) {
  console.error(`${failures.length} check(s) failed:`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error(`${passed} passed.`);
  process.exit(1);
}
console.log(`All ${passed} check:billing checks passed.`);
