import { Prisma, type ProjectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { nextId } from "@/lib/services/projects";
import { notifyAdmins, notifyUsers } from "@/lib/services/notifications";
import { emailPendingCommission } from "@/lib/services/ambassador-commission";
import {
  callbackBaseUrl,
  initializeTransaction,
  isValidWebhookSignature,
  listTransactions,
  verifyTransaction,
  PaystackError,
  type PaystackTransactionData,
} from "@/lib/paystack";

export class PaystackPaymentError extends Error {}

type Leg = "downpayment" | "balance";

const LEG_PAYMENT_TYPE: Record<Leg, "CLIENT_DOWNPAYMENT" | "CLIENT_BALANCE"> = {
  downpayment: "CLIENT_DOWNPAYMENT",
  balance: "CLIENT_BALANCE",
};

// A project only unlocks a leg's Paystack link from one specific status —
// mirrors the manual-verification guards in transitionProject/verifyPayment.
const LEG_REQUIRED_STATUS: Record<Leg, ProjectStatus> = {
  downpayment: "NEW",
  balance: "APPROVED",
};

const LEG_ADVANCE_STATUS: Record<Leg, ProjectStatus> = {
  downpayment: "DOWNPAYMENT_VERIFIED",
  balance: "BALANCE_VERIFIED",
};

// ─────────────────────────────────────────────────────────────
// B2 — initialize a transaction
// ─────────────────────────────────────────────────────────────

export interface InitializePaystackPaymentResult {
  authorizationUrl: string;
}

/**
 * Starts a Paystack transaction for one payment leg of a project and records
 * a Pending Payment row keyed on the Paystack reference — the webhook later
 * looks the row up by reference rather than creating a new one, which is
 * what makes replayed/duplicate webhook deliveries idempotent.
 */
export async function initializePaystackPayment(
  projectIdOrCode: string,
  leg: Leg
): Promise<InitializePaystackPaymentResult> {
  const project = await db.project.findFirst({
    where: { OR: [{ id: projectIdOrCode }, { projectId: projectIdOrCode }] },
    select: {
      id: true,
      projectId: true,
      status: true,
      downpaymentStatus: true,
      downpaymentAmount: true,
      balanceStatus: true,
      balanceAmount: true,
      client: { select: { fullName: true, email: true } },
    },
  });
  if (!project) throw new PaystackPaymentError("Project not found");

  const legStatus = leg === "downpayment" ? project.downpaymentStatus : project.balanceStatus;
  if (legStatus === "Verified") {
    throw new PaystackPaymentError("That payment has already been verified");
  }
  if (project.status !== LEG_REQUIRED_STATUS[leg]) {
    throw new PaystackPaymentError(
      leg === "downpayment"
        ? "This project is not awaiting a downpayment"
        : "This project is not awaiting a balance payment"
    );
  }

  const amount = leg === "downpayment" ? project.downpaymentAmount : project.balanceAmount;
  if (!(amount > 0)) throw new PaystackPaymentError("Nothing owed for this leg yet");

  const reference = `${project.projectId}-${leg === "downpayment" ? "DP" : "BAL"}-${Date.now()}`;
  // Paystack requires a syntactically valid email even when the client gave none.
  const email = project.client.email?.trim() || `${project.projectId.toLowerCase()}@no-email.educraft.ng`;

  let authorizationUrl: string;
  try {
    const tx = await initializeTransaction({
      email,
      amountNaira: amount,
      reference,
      callbackUrl: `${callbackBaseUrl()}/track/${encodeURIComponent(project.projectId)}?payment=success`,
      metadata: { projectDbId: project.id, projectCode: project.projectId, leg },
    });
    authorizationUrl = tx.authorizationUrl;
  } catch (error) {
    if (error instanceof PaystackError) throw new PaystackPaymentError(error.message);
    throw error;
  }

  // Superseded by this new attempt — clear out so they don't linger as Pending forever.
  await db.payment.updateMany({
    where: { projectId: project.id, type: LEG_PAYMENT_TYPE[leg], status: "Pending" },
    data: { status: "Failed" },
  });

  await db.payment.create({
    data: {
      paymentId: await nextId("PAYMENT"),
      type: LEG_PAYMENT_TYPE[leg],
      direction: "INFLOW",
      projectId: project.id,
      personName: project.client.fullName,
      personRole: "Client",
      amount,
      paymentMethod: "Paystack",
      reference,
      status: "Pending",
      date: new Date(),
    },
  });

  return { authorizationUrl };
}

// ─────────────────────────────────────────────────────────────
// B3 — webhook handling
// ─────────────────────────────────────────────────────────────

export function verifyPaystackSignature(rawBody: string, signature: string | null): boolean {
  return isValidWebhookSignature(rawBody, signature);
}

export type CreditReferenceResult =
  | { status: "confirmed" }
  | { status: "already_confirmed" }
  | { status: "not_successful"; paystackStatus: string }
  | { status: "no_local_record" }
  | { status: "missing_metadata" };

/**
 * Verifies one Paystack reference server-to-server and, if it actually
 * succeeded, credits the matching Payment/Project — the same crediting logic
 * whether it's triggered by a webhook delivery or an admin's manual
 * reconciliation "Sync" click. Never trusts a caller-supplied status; always
 * re-checks with Paystack directly.
 */
async function creditReference(reference: string): Promise<CreditReferenceResult> {
  const verified: PaystackTransactionData = await verifyTransaction(reference);

  const payment = await db.payment.findFirst({ where: { reference } });
  if (!payment) return { status: "no_local_record" };
  if (payment.status === "Confirmed") return { status: "already_confirmed" };

  if (verified.status !== "success") {
    await db.payment.update({ where: { id: payment.id }, data: { status: "Failed" } });
    return { status: "not_successful", paystackStatus: verified.status };
  }

  const metadata = verified.metadata ?? {};
  const leg = metadata.leg as Leg | undefined;
  const projectDbId = (metadata.projectDbId as string | undefined) ?? payment.projectId ?? undefined;
  if (!leg || !projectDbId) return { status: "missing_metadata" };

  const project = await db.project.findUnique({
    where: { id: projectDbId },
    select: {
      id: true,
      projectId: true,
      status: true,
      ambassador: { select: { userId: true } },
      downpaymentStatus: true,
      balanceStatus: true,
    },
  });
  if (!project) return { status: "no_local_record" };

  const legStatus = leg === "downpayment" ? project.downpaymentStatus : project.balanceStatus;
  if (legStatus === "Verified") {
    await db.payment.update({ where: { id: payment.id }, data: { status: "Confirmed" } });
    return { status: "already_confirmed" };
  }

  // Paystack's confirmed amount includes any fee surcharge added on top when
  // the customer bears the charge, so it's routinely a little higher than
  // what we asked for — only a *shortfall* is a real problem worth flagging.
  const amountNaira = verified.amount / 100;
  if (amountNaira < payment.amount - 1) {
    console.error(
      `[paystack] short payment on ${reference}: expected ${payment.amount}, Paystack confirmed ${amountNaira}`
    );
  }
  const paidOn = verified.paid_at ? new Date(verified.paid_at) : new Date();
  const advance = project.status === LEG_REQUIRED_STATUS[leg] ? LEG_ADVANCE_STATUS[leg] : null;

  const data: Prisma.ProjectUpdateInput =
    leg === "downpayment"
      ? { downpaymentStatus: "Verified", downpaymentDate: paidOn, downpaymentReference: reference }
      : { balanceStatus: "Verified", balanceDate: paidOn, balanceReference: reference };
  if (advance) data.status = advance;

  const writes: Prisma.PrismaPromise<unknown>[] = [
    db.project.update({ where: { id: project.id }, data }),
    db.payment.update({
      where: { id: payment.id },
      data: {
        status: "Confirmed",
        // amount stays the project's leg amount, not Paystack's gross charge —
        // the customer-borne fee on top is not EduCraft revenue.
        paymentMethod: verified.channel ? `Paystack (${verified.channel})` : "Paystack",
        date: paidOn,
      },
    }),
  ];

  if (advance) {
    writes.push(
      db.projectStatusLog.create({
        data: {
          projectId: project.id,
          fromStatus: project.status,
          toStatus: advance,
          notes: `${leg === "downpayment" ? "Downpayment" : "Balance"} verified via Paystack (${reference})`,
        },
      })
    );
  }

  await db.$transaction(writes);

  await notifyAdmins({
    title: leg === "downpayment" ? "Downpayment received" : "Balance received",
    message:
      leg === "downpayment"
        ? `Paystack confirmed the downpayment for ${project.projectId}.`
        : `Paystack confirmed the balance for ${project.projectId} — ready for delivery.`,
    type: "success",
    link: `/admin/projects/${project.projectId}`,
  });

  if (leg === "downpayment" && project.ambassador?.userId) {
    await notifyUsers([project.ambassador.userId], {
      title: "Referral converted",
      message: `A client you referred paid their downpayment on ${project.projectId}.`,
      type: "success",
      link: "/ambassador/commissions",
    });
  }
  if (leg === "downpayment") await emailPendingCommission(project.id);

  return { status: "confirmed" };
}

/**
 * Handles one Paystack webhook event. Always re-verifies with Paystack's
 * server-to-server endpoint before crediting anything — the webhook payload
 * alone is not trusted, even once its signature checks out.
 */
export async function handlePaystackWebhookEvent(event: {
  event: string;
  data: { reference: string };
}): Promise<void> {
  if (event.event !== "charge.success") return;

  const reference = event.data?.reference;
  if (!reference) return;

  try {
    await creditReference(reference);
  } catch (error) {
    console.error("[paystack webhook]", reference, error);
  }
}

// ─────────────────────────────────────────────────────────────
// B5 — reconciliation
// ─────────────────────────────────────────────────────────────

export class PaystackResyncError extends Error {}

/** Admin-triggered catch-up for a transaction whose webhook never arrived. */
export async function resyncPaystackReference(reference: string): Promise<CreditReferenceResult> {
  try {
    return await creditReference(reference);
  } catch (error) {
    if (error instanceof PaystackError) throw new PaystackResyncError(error.message);
    throw error;
  }
}

export interface ReconciliationRow {
  reference: string;
  projectCode: string | null;
  amount: number; // naira, Paystack's gross confirmed amount
  channel: string | null;
  paidAt: string | null;
  ourStatus: "Confirmed" | "Pending" | "Failed" | "Missing";
}

export interface PaystackReconciliation {
  rows: ReconciliationRow[];
  matchedCount: number;
  outOfSyncCount: number;
}

/** Reference format is `<projectCode>-DP-<ts>` or `<projectCode>-BAL-<ts>`. */
function projectCodeFromReference(reference: string): string | null {
  const match = reference.match(/^(EC-\d+)-(DP|BAL)-/);
  return match ? match[1] : null;
}

/**
 * Cross-references Paystack's own successful-transaction list against our
 * Payment records for the same window, so a webhook that never arrived (or
 * failed) shows up as an out-of-sync row an admin can manually resync.
 */
export async function getPaystackReconciliation(daysBack = 30): Promise<PaystackReconciliation> {
  const from = new Date(Date.now() - daysBack * 86_400_000).toISOString();
  const { data: allTransactions } = await listTransactions({ from, status: "success", perPage: 100 });

  // The Paystack account can carry transactions from other integrations
  // sharing its keys — only ours match this reference shape, so only those
  // are reconcilable against a local Payment record in the first place.
  const data = allTransactions.filter((t) => projectCodeFromReference(t.reference) !== null);

  const references = data.map((t) => t.reference);
  const ours = references.length
    ? await db.payment.findMany({
        where: { reference: { in: references } },
        select: { reference: true, status: true, project: { select: { projectId: true } } },
      })
    : [];
  const ourByRef = new Map(ours.map((p) => [p.reference, p]));

  const rows: ReconciliationRow[] = data.map((t) => {
    const our = ourByRef.get(t.reference);
    return {
      reference: t.reference,
      projectCode: our?.project?.projectId ?? projectCodeFromReference(t.reference),
      amount: t.amount / 100,
      channel: t.channel,
      paidAt: t.paid_at,
      ourStatus: (our?.status as ReconciliationRow["ourStatus"] | undefined) ?? "Missing",
    };
  });

  rows.sort((a, b) => Number(a.ourStatus === "Confirmed") - Number(b.ourStatus === "Confirmed"));

  return {
    rows,
    matchedCount: rows.filter((r) => r.ourStatus === "Confirmed").length,
    outOfSyncCount: rows.filter((r) => r.ourStatus !== "Confirmed").length,
  };
}
