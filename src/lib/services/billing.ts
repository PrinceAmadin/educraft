/**
 * Phase D10: the billing helpers.
 *
 * - storeReceipt(paymentId): renders the receipt PDF for a verified payment
 *   and writes it to the private blob store. Fires from verifyPayment in
 *   waitUntil after the confirm transaction commits, so a Verify never waits
 *   on Blob I/O. Idempotent: a payment that already has a stored receipt at
 *   the same path is left alone.
 * - streamStoredReceipt(payment): reads a stored receipt PDF back out of the
 *   blob store. The receipt route calls this first and falls back to an
 *   on-demand render for payments verified before D10.
 *
 * The receipt for the client is derived from the same ReceiptData shape the
 * on-demand path uses (getReceiptData in client-portal.ts). We construct that
 * shape here from a server-side read that ignores client scope: the caller is
 * always the server itself, and a Verify has already happened.
 */

import crypto from "crypto";
import { db } from "@/lib/db";
import { buildReceiptPath } from "@/lib/files/paths";
import { deleteStoredFile, putPrivateFile, readFile } from "@/lib/files/storage";
import { buildReceiptPdf, type ReceiptVariant } from "@/lib/receipts";
import { getHqContact } from "@/lib/services/hq-contact";
import type { ReceiptData } from "@/lib/services/client-portal";

const TAG = "[billing]";

/**
 * Fetches the ReceiptData for one confirmed payment on the server side, no
 * client scope. Returns null when the payment is not confirmed (nothing to
 * receipt) or the project has been deleted.
 */
export async function serverReceiptData(paymentDbId: string): Promise<ReceiptData | null> {
  const payment = await db.payment.findUnique({
    where: { id: paymentDbId },
    select: {
      id: true,
      paymentId: true,
      type: true,
      amount: true,
      paymentMethod: true,
      reference: true,
      date: true,
      status: true,
      project: {
        select: {
          id: true,
          projectId: true,
          projectTitle: true,
          price: true,
          service: { select: { serviceName: true } },
          client: { select: { fullName: true, clientId: true } },
          payments: {
            where: { direction: "INFLOW", status: "Confirmed", type: { in: ["CLIENT_DOWNPAYMENT", "CLIENT_BALANCE"] } },
            orderBy: { date: "asc" },
            select: { id: true, amount: true },
          },
        },
      },
    },
  });
  if (!payment?.project || payment.status !== "Confirmed") return null;
  if (payment.type !== "CLIENT_DOWNPAYMENT" && payment.type !== "CLIENT_BALANCE") return null;
  const project = payment.project;
  const index = project.payments.findIndex((p) => p.id === payment.id);
  const paidToDate = index < 0
    ? project.payments.reduce((s, p) => s + p.amount, 0)
    : project.payments.slice(0, index + 1).reduce((s, p) => s + p.amount, 0);
  return {
    receiptNo: payment.paymentId,
    date: payment.date,
    amount: payment.amount,
    leg: payment.type === "CLIENT_BALANCE" ? "balance" : "downpayment",
    method: payment.paymentMethod,
    reference: payment.reference,
    clientName: project.client.fullName,
    clientId: project.client.clientId,
    projectCode: project.projectId,
    projectTitle: project.projectTitle?.trim() || project.service.serviceName,
    serviceName: project.service.serviceName,
    price: project.price,
    paidToDate,
    remaining: Math.max(0, project.price - paidToDate),
  };
}

export interface StoredReceipt {
  paymentId: string;
  blobPath: string;
  storedAt: Date;
  size: number;
}

/**
 * Renders and stores the receipt PDF for a verified payment. Returns the
 * stored path when the write succeeds, or null when the payment is not in a
 * state that has a receipt. Never throws: a store failure leaves the row
 * with receiptBlobPath: null and the on-demand renderer serves the receipt.
 */
export async function storeReceipt(paymentDbId: string): Promise<StoredReceipt | null> {
  try {
    const existing = await db.payment.findUnique({
      where: { id: paymentDbId },
      select: { receiptBlobPath: true, receiptStoredAt: true, project: { select: { id: true } } },
    });
    if (existing?.receiptBlobPath && existing.receiptStoredAt) {
      return { paymentId: paymentDbId, blobPath: existing.receiptBlobPath, storedAt: existing.receiptStoredAt, size: 0 };
    }
    const data = await serverReceiptData(paymentDbId);
    if (!data || !existing?.project) return null;
    const pdf = buildReceiptPdf(data, { hq: await getHqContact() });
    const path = buildReceiptPath({
      projectDbId: existing.project.id,
      paymentDbId,
      random: crypto.randomBytes(12).toString("hex"),
    });
    await putPrivateFile(path, new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength), "application/pdf");
    const storedAt = new Date();
    await db.payment.update({ where: { id: paymentDbId }, data: { receiptBlobPath: path, receiptStoredAt: storedAt } });
    console.info(`${TAG} stored receipt for ${paymentDbId} at ${path} (${pdf.byteLength} bytes)`);
    return { paymentId: paymentDbId, blobPath: path, storedAt, size: pdf.byteLength };
  } catch (error) {
    console.error(`${TAG} could not store receipt for ${paymentDbId}`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Reads a stored receipt PDF back from the private blob store. Returns null when
 * the payment has no stored path or the blob is missing (the caller falls back
 * to the on-demand renderer). Never throws.
 */
export async function readStoredReceipt(blobPath: string): Promise<Buffer | null> {
  try {
    const info = await readFile(blobPath);
    if (!info) return null;
    const chunks: Uint8Array[] = [];
    const reader = info.stream.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const total = chunks.reduce((n, c) => n + c.byteLength, 0);
    const buf = Buffer.allocUnsafe(total);
    let offset = 0;
    for (const c of chunks) {
      buf.set(c, offset);
      offset += c.byteLength;
    }
    return buf;
  } catch (error) {
    console.error(`${TAG} could not read stored receipt at ${blobPath}`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Deletes the stored receipt (e.g. on refund). Never throws. The Payment row's
 * receiptBlobPath is left alone here; the caller decides whether to null it
 * (a refund typically keeps the historical receipt path for audit purposes).
 */
export async function unlinkStoredReceipt(blobPath: string): Promise<void> {
  await deleteStoredFile(blobPath).catch((error) =>
    console.warn(`${TAG} could not delete stored receipt at ${blobPath}`, error instanceof Error ? error.message : error),
  );
}

/** Re-exported so route handlers can request the invoice variant with one import. */
export type { ReceiptVariant };
