import { Prisma, type ProjectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { deliverIfFinalReleased, nextId } from "@/lib/services/projects";
import { notifyAdmins, notifyFinance, notifyRole, notifyUsers } from "@/lib/services/notifications";
import { monthKeyOf, syncProjectBuckets } from "@/lib/services/finance/buckets";
import { emailPendingCommission } from "@/lib/services/ambassador-commission";
import { alertPaidIntakeFailed, alertPaidOrder } from "@/lib/services/team-alerts";
import { IntakeError, submitIntake } from "@/lib/services/intake";
import { recordUpdate } from "@/lib/services/client-updates";
import { notifyClient } from "@/lib/services/client-notify";
import { balancePayable } from "@/lib/payment-rules";
import { formatNaira } from "@/lib/utils";
import { resolveTemplate } from "@/lib/intake-templates";
import { computePrice } from "@/lib/pricing";
import { intakeBasePrice, isChapterService, normalizeChapters } from "@/lib/chapter-pricing";
import type { IntakeSubmitInput } from "@/lib/validations/intake";
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

// The status a paid leg moves the project on from. The downpayment is only
// payable at NEW; the balance is payable from any working status once the
// downpayment is in (see src/lib/payment-rules.ts), and only moves the project
// on (APPROVED -> BALANCE_VERIFIED) when it arrives at APPROVED.
const LEG_REQUIRED_STATUS: Record<Leg, ProjectStatus> = {
  downpayment: "NEW",
  balance: "APPROVED",
};

const LEG_ADVANCE_STATUS: Record<Leg, ProjectStatus> = {
  downpayment: "DOWNPAYMENT_VERIFIED",
  balance: "BALANCE_VERIFIED",
};

/** Payment rows nothing here ever moves again: confirmed, held as a duplicate, refunded, or refused. */
const SETTLED_STATUSES = new Set(["Confirmed", "Duplicate", "Reversed", "Rejected"]);

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
  leg: Leg,
  /** The signed-in client may pay the balance before QA approval (Chapters 3+ need it). */
  opts: { allowEarlyBalance?: boolean } = {}
): Promise<InitializePaystackPaymentResult> {
  const project = await db.project.findFirst({
    where: { OR: [{ id: projectIdOrCode }, { projectId: projectIdOrCode }] },
    select: {
      id: true,
      projectId: true,
      status: true,
      isProBono: true,
      downpaymentStatus: true,
      downpaymentAmount: true,
      balanceStatus: true,
      balanceAmount: true,
      ambassadorId: true,
      client: { select: { fullName: true, email: true } },
    },
  });
  if (!project) throw new PaystackPaymentError("Project not found");

  const legStatus = leg === "downpayment" ? project.downpaymentStatus : project.balanceStatus;
  if (legStatus === "Verified") {
    throw new PaystackPaymentError("That payment has already been verified");
  }
  const payableNow =
    leg === "balance" && opts.allowEarlyBalance ? balancePayable(project) : project.status === LEG_REQUIRED_STATUS[leg];
  if (!payableNow) {
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
      // Paystack adds &reference=… on the way back; the project page checks it
      // with Paystack at once, so the client never waits on the webhook.
      callbackUrl: `${callbackBaseUrl()}/client/projects/${encodeURIComponent(project.projectId)}?tab=payments&payment=success`,
      metadata: { projectDbId: project.id, projectCode: project.projectId, leg },
    });
    authorizationUrl = tx.authorizationUrl;
  } catch (error) {
    if (error instanceof PaystackError) throw new PaystackPaymentError(error.message);
    throw error;
  }

  // Earlier Paystack attempts are superseded by this one — clear them out so
  // they don't linger as Pending forever. A bank transfer the admin marked as
  // paid (source MANUAL) is finance's to confirm or refuse, never touched here.
  await db.payment.updateMany({
    where: { projectId: project.id, type: LEG_PAYMENT_TYPE[leg], status: "Pending", source: "PAYSTACK" },
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
      source: "PAYSTACK",
      ambassadorId: project.ambassadorId,
      isAmbassadorDriven: project.ambassadorId != null,
      date: new Date(),
    },
  });

  return { authorizationUrl };
}

// ─────────────────────────────────────────────────────────────
// Pay-first public intake — payment happens before a Client/Project exists.
// ─────────────────────────────────────────────────────────────

/**
 * Starts a Paystack transaction for a not-yet-submitted intake form. Nothing
 * is written to Client/Project here — the validated payload is staged in
 * PendingIntake and only replayed into submitIntake() once the webhook
 * confirms payment, so an abandoned checkout leaves no project behind.
 */
export async function initializeIntakePayment(
  input: IntakeSubmitInput
): Promise<InitializePaystackPaymentResult> {
  const service = await db.service.findFirst({
    where: { serviceCode: input.serviceCode, isActive: true },
    select: {
      basePrice: true,
      intakeFormTemplate: true,
      expressDeliverySurcharge: true,
      downpaymentPercentage: true,
      variants: { where: { isActive: true }, select: { id: true, priceAddon: true } },
    },
  });
  if (!service) throw new PaystackPaymentError("That service is no longer available");

  let variantAddon = 0;
  if (input.serviceVariantId) {
    const variant = service.variants.find((v) => v.id === input.serviceVariantId);
    if (!variant) throw new PaystackPaymentError("That option is no longer available");
    variantAddon = variant.priceAddon;
  }

  const template = resolveTemplate(service.intakeFormTemplate);
  if (!template || template !== input.template) {
    throw new PaystackPaymentError("This form does not match the selected service");
  }

  const chapters = normalizeChapters(input.chapters);
  if (isChapterService(input.serviceCode) && chapters.length === 0) {
    throw new PaystackPaymentError("Choose at least one chapter");
  }
  const price = computePrice({
    basePrice: intakeBasePrice({ serviceCode: input.serviceCode, basePrice: service.basePrice, variantAddon, chapters }),
    expressSurcharge: service.expressDeliverySurcharge ?? 0,
    isExpressDelivery: input.isExpressDelivery,
    downpaymentPercentage: service.downpaymentPercentage,
  });
  if (!(price.downpaymentAmount > 0)) {
    throw new PaystackPaymentError("This service doesn't have a fixed price yet — use the regular submit flow");
  }

  const reference = `INTAKE-${crypto.randomUUID()}`;
  const pending = await db.pendingIntake.create({
    data: {
      serviceCode: input.serviceCode,
      template: input.template,
      payload: input as unknown as Prisma.InputJsonValue,
      reference,
    },
    select: { id: true },
  });

  const email = input.email?.trim() || `${pending.id}@no-email.educraft.ng`;

  let authorizationUrl: string;
  try {
    const tx = await initializeTransaction({
      email,
      amountNaira: price.downpaymentAmount,
      reference,
      callbackUrl: `${callbackBaseUrl()}/intake/success?ref=${encodeURIComponent(reference)}`,
      metadata: { pendingIntakeId: pending.id },
    });
    authorizationUrl = tx.authorizationUrl;
  } catch (error) {
    await db.pendingIntake.update({ where: { id: pending.id }, data: { status: "FAILED" } });
    if (error instanceof PaystackError) throw new PaystackPaymentError(error.message);
    throw error;
  }

  return { authorizationUrl };
}

export type PendingIntakeStatus =
  | { state: "pending" }
  | { state: "consumed"; projectCode: string }
  | { state: "failed" }
  | { state: "not_found" };

/** Polled by /intake/success while the webhook is still catching up with the redirect. */
export async function getPendingIntakeStatus(reference: string): Promise<PendingIntakeStatus> {
  const pending = await db.pendingIntake.findUnique({
    where: { reference },
    select: { status: true, resultProjectCode: true },
  });
  if (!pending) return { state: "not_found" };
  if (pending.status === "CONSUMED" && pending.resultProjectCode) {
    return { state: "consumed", projectCode: pending.resultProjectCode };
  }
  if (pending.status === "FAILED") return { state: "failed" };
  return { state: "pending" };
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
 * succeeded, credits the matching record — the same crediting logic whether
 * it's triggered by a webhook delivery or an admin's manual reconciliation
 * "Sync" click. Never trusts a caller-supplied status; always re-checks with
 * Paystack directly. Branches early on metadata shape: a pay-first intake
 * reference has no Project/Payment row yet (the webhook itself creates them),
 * so it can't go through the existing Payment-row lookup below.
 */
async function creditReference(reference: string): Promise<CreditReferenceResult> {
  const verified: PaystackTransactionData = await verifyTransaction(reference);
  const metadata = verified.metadata ?? {};

  if (typeof metadata.pendingIntakeId === "string") {
    return creditPendingIntake(reference, metadata.pendingIntakeId, verified);
  }
  return creditProjectPayment(reference, verified);
}

async function creditProjectPayment(
  reference: string,
  verified: PaystackTransactionData
): Promise<CreditReferenceResult> {
  const payment = await db.payment.findFirst({ where: { reference } });
  if (!payment) return { status: "no_local_record" };
  // Already handled, whatever the outcome was: confirmed, held as a duplicate,
  // refunded, or refused. Nothing here ever moves a row out of those.
  if (SETTLED_STATUSES.has(payment.status)) return { status: "already_confirmed" };

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
      ambassadorId: true,
      ambassador: { select: { userId: true } },
      downpaymentStatus: true,
      balanceStatus: true,
    },
  });
  if (!project) return { status: "no_local_record" };

  const paidOn = verified.paid_at ? new Date(verified.paid_at) : new Date();
  const method = verified.channel ? `Paystack (${verified.channel})` : "Paystack";

  const legStatus = leg === "downpayment" ? project.downpaymentStatus : project.balanceStatus;
  if (legStatus === "Verified") {
    // Money arrived for a leg finance had already verified (a bank transfer
    // confirmed by hand, then the Paystack checkout went through too). That
    // is a second charge, not revenue: hold it as Duplicate for a refund and
    // never let it into the buckets.
    const held = await db.payment.updateMany({
      where: { id: payment.id, status: { notIn: [...SETTLED_STATUSES] } },
      data: { status: "Duplicate", paymentMethod: method, date: paidOn },
    });
    if (held.count === 1) {
      await notifyFinance({
        title: "Possible double payment",
        message: `${project.projectId}: Paystack confirmed ${formatNaira(payment.amount)} for a ${leg} that was already verified. Refund it — it is held as a duplicate in the Revenue Tracker.`,
        type: "urgent",
        link: "/admin/finance/revenue?status=Duplicate",
      });
    }
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
  const wantAdvance = project.status === LEG_REQUIRED_STATUS[leg] ? LEG_ADVANCE_STATUS[leg] : null;

  const legData: Prisma.ProjectUpdateManyMutationInput =
    leg === "downpayment"
      ? { downpaymentStatus: "Verified", downpaymentDate: paidOn, downpaymentReference: reference }
      : { balanceStatus: "Verified", balanceDate: paidOn, balanceReference: reference };

  // One transaction, and the Payment row is claimed first: Paystack's webhook,
  // the client's return page and an admin Sync can all arrive at once, and only
  // the one that flips the row to Confirmed goes on to credit the project.
  const outcome = await db.$transaction(
    async (tx) => {
      const claim = await tx.payment.updateMany({
        where: { id: payment.id, status: { notIn: [...SETTLED_STATUSES] } },
        data: {
          status: "Confirmed",
          // amount stays the project's leg amount, not Paystack's gross charge —
          // the customer-borne fee on top is not EduCraft revenue.
          paymentMethod: method,
          ambassadorId: project.ambassadorId,
          isAmbassadorDriven: project.ambassadorId != null,
          date: paidOn,
        },
      });
      if (claim.count !== 1) return null;

      // Move the project on only if it is still where we read it.
      let advance: ProjectStatus | null = null;
      if (wantAdvance) {
        const moved = await tx.project.updateMany({
          where: { id: project.id, status: project.status },
          data: { ...legData, status: wantAdvance },
        });
        if (moved.count === 1) advance = wantAdvance;
      }
      if (!advance) await tx.project.updateMany({ where: { id: project.id }, data: legData });

      if (advance) {
        await tx.projectStatusLog.create({
          data: {
            projectId: project.id,
            fromStatus: project.status,
            toStatus: advance,
            notes: `${leg === "downpayment" ? "Downpayment" : "Balance"} verified via Paystack (${reference})`,
          },
        });
      }
      await recordUpdate(tx, {
        projectId: project.id,
        kind: "PAYMENT",
        title: "Payment received",
        body: `Your ${leg} of ${formatNaira(payment.amount)} is confirmed.`,
        dedupeKey: `payment:${payment.id}`,
      });
      // EduCraft's retained share of this money goes into the four buckets.
      await syncProjectBuckets(tx, project.id, { reason: "PAYMENT", paymentId: payment.id, month: monthKeyOf(paidOn) });
      return { advance };
    },
    { timeout: 15_000, maxWait: 10_000 }
  );
  if (!outcome) return { status: "already_confirmed" };
  const advance = outcome.advance;

  await notifyRole(["CO_CEO_CFO"], {
    title: leg === "downpayment" ? "Downpayment received" : "Balance received",
    message: `Paystack confirmed ${formatNaira(payment.amount)} (${leg}) for ${project.projectId}.`,
    type: "success",
    link: "/admin/finance/revenue",
  });

  // An order submitted first (variable price) is now paid: tell the team's
  // Gmail. Queued before anything else can throw, so it is never lost.
  if (leg === "downpayment") {
    alertPaidOrder(project.id, {
      reference,
      paymentMethod: verified.channel ? `Paystack (${verified.channel})` : "Paystack",
      paidOn,
      newOrder: false,
      advanced: advance !== null,
    });
  }

  await notifyAdmins({
    title: leg === "downpayment" ? "Downpayment received" : "Balance received",
    message:
      leg === "downpayment"
        ? `Paystack confirmed the downpayment for ${project.projectId}.`
        : advance
          ? `Paystack confirmed the balance for ${project.projectId} — ready for delivery.`
          : `Paystack confirmed the balance for ${project.projectId} early. Chapters 3+ and the final unlock for the client; delivery still waits for QA.`,
    type: "success",
    link: `/admin/projects/${project.projectId}`,
  });

  await notifyClient(project.id, {
    title: "Payment received",
    message: `Your ${leg} for ${project.projectId} is confirmed.`,
    type: "success",
    tab: "payments",
    email: {
      kind: "payment",
      heading: "Payment received",
      lines: [
        `Your ${leg} of ${formatNaira(payment.amount)} is confirmed. Thank you.`,
        "Your receipt is in the Payments tab of your dashboard.",
      ],
      ctaLabel: "View your receipt",
    },
  });

  if (leg === "downpayment" && project.ambassador?.userId) {
    await notifyUsers([project.ambassador.userId], {
      title: "A client you referred has paid",
      message: `They paid their downpayment on ${project.projectId}. That is one more paying client toward your next level.`,
      type: "success",
      link: "/ambassador/commissions",
    });
  }
  if (leg === "downpayment") await emailPendingCommission(project.id);
  // Balance in and the complete document already released: that is delivery.
  if (advance === "BALANCE_VERIFIED") await deliverIfFinalReleased(project.id);

  return { status: "confirmed" };
}

/**
 * The pay-first counterpart to creditProjectPayment: no Client/Project exists
 * yet, so a confirmed payment both creates them (via submitIntake, the same
 * path the old direct-submit flow used) and marks the downpayment verified in
 * one go, rather than landing a new project at NEW/Unpaid for someone to
 * chase up.
 */
async function creditPendingIntake(
  reference: string,
  pendingIntakeId: string,
  verified: PaystackTransactionData
): Promise<CreditReferenceResult> {
  const pending = await db.pendingIntake.findUnique({ where: { id: pendingIntakeId } });
  if (!pending || pending.reference !== reference) return { status: "no_local_record" };
  if (pending.status === "CONSUMED" || pending.resultProjectCode) return { status: "already_confirmed" };
  if (verified.status !== "success") return processPendingIntake(reference, pendingIntakeId, verified);

  // The success page's poll, Paystack's webhook and an admin Sync can all reach
  // this at once. Exactly one of them wins the claim and creates the project;
  // the rest see it as already handled.
  const claim = await db.pendingIntake.updateMany({
    where: { id: pendingIntakeId, status: "PENDING" },
    data: { status: "PROCESSING" },
  });
  if (claim.count === 0) return { status: "already_confirmed" };

  try {
    return await processPendingIntake(reference, pendingIntakeId, verified);
  } catch (error) {
    // Not finished: hand the claim back so a retry can pick it up.
    await db.pendingIntake.updateMany({ where: { id: pendingIntakeId, status: "PROCESSING" }, data: { status: "PENDING" } });
    throw error;
  }
}

async function processPendingIntake(
  reference: string,
  pendingIntakeId: string,
  verified: PaystackTransactionData
): Promise<CreditReferenceResult> {
  const pending = await db.pendingIntake.findUnique({ where: { id: pendingIntakeId } });
  if (!pending || pending.reference !== reference) return { status: "no_local_record" };
  if (pending.status === "CONSUMED") return { status: "already_confirmed" };

  if (verified.status !== "success") {
    if (pending.status === "PENDING") {
      await db.pendingIntake.update({ where: { id: pendingIntakeId }, data: { status: "FAILED" } });
    }
    return { status: "not_successful", paystackStatus: verified.status };
  }

  // A previous delivery may have created the project and then crashed or
  // timed out before the money was recorded. The project code is remembered
  // the moment it exists, so a retry picks that project up and never creates
  // a second one for the same payment.
  let projectCode = pending.resultProjectCode;
  if (!projectCode) {
    let created: { projectId: string };
    try {
      created = await submitIntake(pending.payload as unknown as IntakeSubmitInput);
    } catch (error) {
      console.error(`[paystack] submitIntake failed for pending intake ${pendingIntakeId}`, error);
      if (error instanceof IntakeError) {
        await db.pendingIntake.update({ where: { id: pendingIntakeId }, data: { status: "FAILED" } });
        // Paid, but no project: nothing else in HQ shows this money, so say so loudly.
        const paidOn = verified.paid_at ? new Date(verified.paid_at) : new Date();
        alertPaidIntakeFailed(pendingIntakeId, {
          reference,
          amountNaira: verified.amount / 100,
          paidOn,
          reason: error.message,
        });
        const form = (pending.payload ?? {}) as { fullName?: unknown; phone?: unknown };
        const who = [form.fullName, form.phone].filter((v) => typeof v === "string" && v.trim()).join(", ");
        await notifyAdmins({
          title: "Payment received, order not created",
          message: `Paystack confirmed ${reference}${who ? ` from ${who}` : ""}, but the order could not be created (${error.message}). Contact the client, then create the project by hand or refund them in Paystack.`,
          type: "urgent",
          link: "/admin/projects/new",
        });
        return { status: "missing_metadata" };
      }
      throw error;
    }
    projectCode = created.projectId;
    await db.pendingIntake.update({ where: { id: pendingIntakeId }, data: { resultProjectCode: projectCode } });
  }

  const project = await db.project.findUnique({
    where: { projectId: projectCode },
    select: {
      id: true,
      projectId: true,
      downpaymentAmount: true,
      ambassadorId: true,
      ambassador: { select: { userId: true } },
      client: { select: { fullName: true } },
    },
  });
  if (!project) return { status: "no_local_record" };

  const amountNaira = verified.amount / 100;
  if (amountNaira < project.downpaymentAmount - 1) {
    console.error(
      `[paystack] short payment on ${reference}: expected ${project.downpaymentAmount}, Paystack confirmed ${amountNaira}`
    );
  }
  const paidOn = verified.paid_at ? new Date(verified.paid_at) : new Date();
  const paymentId = await nextId("PAYMENT");

  const outcome = await db.$transaction(
    async (tx) => {
      // Claim the leg: a retry after a crash finds it verified and only closes the staging row.
      const claimed = await tx.project.updateMany({
        where: { id: project.id, downpaymentStatus: { not: "Verified" } },
        data: {
          downpaymentStatus: "Verified",
          downpaymentDate: paidOn,
          downpaymentReference: reference,
          status: "DOWNPAYMENT_VERIFIED",
        },
      });
      if (claimed.count !== 1) {
        await tx.pendingIntake.update({
          where: { id: pendingIntakeId },
          data: { status: "CONSUMED", consumedAt: paidOn, resultProjectCode: project.projectId },
        });
        return null;
      }
      const payment = await tx.payment.create({
        data: {
          paymentId,
          type: "CLIENT_DOWNPAYMENT",
          direction: "INFLOW",
          projectId: project.id,
          personName: project.client.fullName,
          personRole: "Client",
          amount: project.downpaymentAmount,
          paymentMethod: verified.channel ? `Paystack (${verified.channel})` : "Paystack",
          reference,
          status: "Confirmed",
          source: "PAYSTACK",
          ambassadorId: project.ambassadorId,
          isAmbassadorDriven: project.ambassadorId != null,
          date: paidOn,
        },
        select: { id: true },
      });
      await tx.projectStatusLog.create({
        data: {
          projectId: project.id,
          fromStatus: "NEW",
          toStatus: "DOWNPAYMENT_VERIFIED",
          notes: `Downpayment verified via Paystack (${reference}) — project created on payment success`,
        },
      });
      await tx.pendingIntake.update({
        where: { id: pendingIntakeId },
        data: { status: "CONSUMED", consumedAt: paidOn, resultProjectCode: project.projectId },
      });
      await recordUpdate(tx, {
        projectId: project.id,
        kind: "PAYMENT",
        title: "Payment received",
        body: `Your downpayment of ${formatNaira(project.downpaymentAmount)} is confirmed.`,
        dedupeKey: `payment-ref:${reference}`,
      });
      // EduCraft's retained share of this money goes into the four buckets.
      await syncProjectBuckets(tx, project.id, { reason: "PAYMENT", paymentId: payment.id, month: monthKeyOf(paidOn) });
      return { paymentId: payment.id };
    },
    { timeout: 15_000, maxWait: 10_000 }
  );
  if (!outcome) return { status: "already_confirmed" };

  // A new, paid order: tell the team's Gmail (Settings > Email alerts).
  // Queued before anything else can throw, so it is never lost.
  alertPaidOrder(project.id, {
    reference,
    paymentMethod: verified.channel ? `Paystack (${verified.channel})` : "Paystack",
    paidOn,
    newOrder: true,
    advanced: true,
  });

  await notifyAdmins({
    title: "Downpayment received",
    message: `Paystack confirmed the downpayment for ${project.projectId} — new project created.`,
    type: "success",
    link: `/admin/projects/${project.projectId}`,
  });
  await notifyRole(["CO_CEO_CFO"], {
    title: "Downpayment received",
    message: `Paystack confirmed ${formatNaira(project.downpaymentAmount)} for ${project.projectId} — a new order.`,
    type: "success",
    link: "/admin/finance/revenue",
  });

  await notifyClient(project.id, {
    title: "Payment received",
    message: `Your downpayment for ${project.projectId} is confirmed.`,
    type: "success",
    tab: "payments",
    email: {
      kind: "payment",
      heading: "Payment received",
      lines: [
        `Your downpayment of ${formatNaira(project.downpaymentAmount)} is confirmed. Thank you.`,
        "Sign in to follow your project and keep your receipt.",
      ],
      ctaLabel: "Open your dashboard",
    },
  });

  if (project.ambassador?.userId) {
    await notifyUsers([project.ambassador.userId], {
      title: "A client you referred has paid",
      message: `They paid their downpayment on ${project.projectId}. That is one more paying client toward your next level.`,
      type: "success",
      link: "/ambassador/commissions",
    });
  }
  await emailPendingCommission(project.id);

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
  /** Duplicate (a second charge held for refund), Reversed and Rejected are settled: nothing to sync. */
  ourStatus: "Confirmed" | "Duplicate" | "Reversed" | "Rejected" | "Pending" | "Failed" | "Missing";
}

/** Local statuses that mean Paystack's record is fully accounted for on our side. */
export const RECONCILED_STATUSES: ReadonlySet<ReconciliationRow["ourStatus"]> = new Set(["Confirmed", "Duplicate", "Reversed", "Rejected"]);

export function isReconciled(status: ReconciliationRow["ourStatus"]): boolean {
  return RECONCILED_STATUSES.has(status);
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

  rows.sort((a, b) => Number(isReconciled(a.ourStatus)) - Number(isReconciled(b.ourStatus)));

  return {
    rows,
    matchedCount: rows.filter((r) => isReconciled(r.ourStatus)).length,
    outOfSyncCount: rows.filter((r) => !isReconciled(r.ourStatus)).length,
  };
}
