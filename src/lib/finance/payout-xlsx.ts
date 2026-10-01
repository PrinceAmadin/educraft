import ExcelJS from "exceljs";
import type { BankExport } from "@/lib/services/finance/payout-batches";

/**
 * The per-recipient bank list for a payout batch, as an .xlsx for a bank
 * bulk-transfer upload (Item 4). Account numbers are written as TEXT cells so a
 * leading zero is never dropped. exceljs is a direct dependency.
 */

export function batchXlsxFilename(data: BankExport): string {
  return `educraft-payout-${data.cohortLabel.toLowerCase()}-${data.periodKey}.xlsx`;
}

export async function buildBatchBankXlsx(data: BankExport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "EduCraft HQ";
  const ws = wb.addWorksheet("Payout");

  ws.columns = [
    { header: "Recipient type", key: "type", width: 16 },
    { header: "Name", key: "name", width: 28 },
    { header: "Bank name", key: "bank", width: 24 },
    { header: "Account number", key: "account", width: 20 },
    { header: "Account name", key: "accountName", width: 28 },
    { header: "Amount (NGN)", key: "amount", width: 16 },
    { header: "Period", key: "period", width: 14 },
  ];
  ws.getRow(1).font = { bold: true };

  for (const r of data.rows) {
    const row = ws.addRow({
      type: r.recipientType,
      name: r.name,
      bank: r.bankName,
      account: r.accountNumber,
      accountName: r.accountName,
      amount: r.amount,
      period: data.periodKey,
    });
    // Account number as text, so a leading zero survives.
    row.getCell("account").numFmt = "@";
  }

  ws.getColumn("amount").numFmt = "#,##0";

  // A total row.
  const total = data.rows.reduce((s, r) => s + r.amount, 0);
  const totalRow = ws.addRow({ accountName: "Total", amount: total });
  totalRow.font = { bold: true };
  totalRow.getCell("amount").numFmt = "#,##0";

  return Buffer.from(await wb.xlsx.writeBuffer());
}
