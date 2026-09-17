import crypto from "crypto";

/**
 * Thin wrapper over Paystack's REST API — no SDK dependency, just fetch.
 * Amounts in and out of this module are naira; Paystack itself speaks kobo.
 */

const PAYSTACK_BASE_URL = "https://api.paystack.co";

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");
  return key;
}

export function callbackBaseUrl(): string {
  return process.env.PAYSTACK_CALLBACK_BASE_URL || "http://localhost:3000";
}

export interface InitializeTransactionInput {
  email: string;
  amountNaira: number;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}

export interface InitializeTransactionResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

export class PaystackError extends Error {}

async function paystackFetchFull(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.status) {
    throw new PaystackError(json?.message || `Paystack request failed (${res.status})`);
  }
  return json;
}

async function paystackFetch(path: string, init?: RequestInit): Promise<any> {
  const json = await paystackFetchFull(path, init);
  return json.data;
}

/** Starts a Paystack transaction. Fee is billed to the client (Paystack's default). */
export async function initializeTransaction(
  input: InitializeTransactionInput
): Promise<InitializeTransactionResult> {
  const data = await paystackFetch("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: Math.round(input.amountNaira * 100),
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata ?? {},
    }),
  });

  return {
    authorizationUrl: data.authorization_url,
    accessCode: data.access_code,
    reference: data.reference,
  };
}

export interface PaystackTransactionData {
  status: "success" | "failed" | "abandoned";
  reference: string;
  amount: number; // kobo
  currency: string;
  channel: string | null;
  paid_at: string | null;
  metadata: Record<string, unknown> | null;
  customer: { email: string };
}

/** Server-to-server confirmation — always call this before trusting a webhook payload. */
export async function verifyTransaction(reference: string): Promise<PaystackTransactionData> {
  return paystackFetch(`/transaction/verify/${encodeURIComponent(reference)}`);
}

export interface PaystackTransactionListItem {
  reference: string;
  amount: number; // kobo
  status: string;
  channel: string | null;
  paid_at: string | null;
  metadata: Record<string, unknown> | null;
}

/** Lists transactions for reconciliation — defaults to successful charges in the window given. */
export async function listTransactions(params: {
  from?: string;
  to?: string;
  perPage?: number;
  page?: number;
  status?: string;
}): Promise<{ data: PaystackTransactionListItem[]; total: number }> {
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  qs.set("perPage", String(params.perPage ?? 50));
  qs.set("page", String(params.page ?? 1));
  if (params.status) qs.set("status", params.status);

  const json = await paystackFetchFull(`/transaction?${qs.toString()}`);
  return { data: json.data, total: json.meta?.total ?? json.data.length };
}

/** Paystack signs webhook bodies with the secret key (HMAC-SHA512, hex). */
export function isValidWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac("sha512", secretKey()).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}
