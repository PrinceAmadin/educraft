/**
 * Revenue Tracker vocabulary shared by the service, the API's query schema and
 * the filter bar (client). Pure — no database here.
 */

/** Payment row statuses the tracker shows. Only Confirmed rows are revenue. */
export const REVENUE_STATUSES = ["Confirmed", "Pending", "Rejected", "Duplicate", "Failed"] as const;
export type RevenueStatus = (typeof REVENUE_STATUSES)[number];

export const REVENUE_STATUS_LABELS: Record<RevenueStatus, string> = {
  Confirmed: "Confirmed",
  Pending: "Awaiting verification",
  Rejected: "Rejected",
  Duplicate: "Duplicate — refund due",
  Failed: "Checkout not completed",
};

/** What a row is: the two client legs, or money going back. */
export const REVENUE_TYPES = ["downpayment", "balance", "refund"] as const;
export type RevenueType = (typeof REVENUE_TYPES)[number];

export const REVENUE_TYPE_LABELS: Record<RevenueType, string> = {
  downpayment: "Downpayment",
  balance: "Balance",
  refund: "Refund",
};

/** Where a row came from (Payment.source). */
export const REVENUE_SOURCES = ["PAYSTACK", "MANUAL", "SYSTEM"] as const;
export type RevenueSource = (typeof REVENUE_SOURCES)[number];

export const REVENUE_SOURCE_LABELS: Record<RevenueSource, string> = {
  PAYSTACK: "Paystack",
  MANUAL: "Bank transfer / cash",
  SYSTEM: "System",
};

/** Methods finance can record for a payment confirmed by hand. */
export const MANUAL_PAYMENT_METHODS = ["Bank transfer", "Cash", "POS", "USSD", "Other"] as const;

export const REVENUE_SORTS = ["date", "amount"] as const;
export type RevenueSort = (typeof REVENUE_SORTS)[number];

export const REVENUE_PAGE_SIZE = 25;

/** Outstanding-balance aging, from the spec: <7 days normal, 7–14 follow up, >14 escalate. */
export const AGING_BANDS = ["normal", "follow_up", "escalate"] as const;
export type AgingBand = (typeof AGING_BANDS)[number];

export const AGING_BAND_META: Record<AgingBand, { label: string; hint: string }> = {
  normal: { label: "Under 7 days", hint: "Recent — no action needed yet" },
  follow_up: { label: "7 to 14 days", hint: "Follow up with the client" },
  escalate: { label: "Over 14 days", hint: "Escalate — the balance is well overdue" },
};
