import { Prisma } from "@prisma/client";
import { del } from "@vercel/blob";
import { db } from "@/lib/db";
import { lockProjectRow } from "@/lib/generation/generation-state";
import { deleteStoredFile } from "@/lib/files/storage";
import { recountAmbassador } from "@/lib/services/ambassador-platform/conversions";
import { loadExecIndex } from "@/lib/services/executives";
import { execForRecord } from "@/lib/executive-identity";
import { ambassadorTier } from "@/lib/ambassadors/tier-utils";
import { quarterKeyOf } from "@/lib/command-center/derive";
import { revalidateCommandCenter } from "@/lib/services/command-center/cache";
import { notifyFinance, notifyRole } from "@/lib/services/notifications";
import {
  CLEANUP_TEXT,
  cleanupRefusals,
  cleanupWarnings,
  confirmMatches,
  confirmPhrase,
  mentionsProject,
  normalizeProjectCode,
  parseFlaggerIdentifier,
  reasonIsValid,
  revenueRemoved,
  summaryLine,
  testSignals,
  type CleanupFacts,
  type DeletionSummary,
} from "@/lib/project-cleanup";
import { formatNaira } from "@/lib/utils";

/**
 * Test project cleanup (Settings > Test data). The founder deletes; the COO
 * and anyone he appoints flag. Rules and wording: src/lib/project-cleanup.ts.
 *
 * A deletion is one transaction per project, under the project's row lock,
 * that removes every row the project put anywhere and puts the figures back
 * as if it never existed: the month's bucket mirrors are given back, the
 * bucket ledger, allocation log, payout records, commission expenses,
 * payments and referral go, every ambassador it touched is recounted (and a
 * tier it alone earned is taken back, history included), then the project
 * itself (everything that cascades) and, when it was their last, the client.
 * AI spend is kept: it was real money. Files go after the commit.
 */

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof db;

export class CleanupError extends Error {
  constructor(message: string, readonly status = 400, readonly refusals: string[] = []) {
    super(message);
  }
}

const BUSY_RUNS: Record<string, string> = {
  GENERATING: "a chapter is being written",
  FETCHING_DATA: "the Mode 5 data is being fetched",
  QUALITY_CHECK: "the quality gate is running",
};

// ── Reading a project's footprint ──────────────────────────────────────────

const projectSelect = {
  id: true,
  projectId: true,
  projectTitle: true,
  status: true,
  price: true,
  isProBono: true,
  createdAt: true,
  workerId: true,
  ambassadorId: true,
  parentAmbassadorId: true,
  parentProjectId: true,
  workerPayoutPaid: true,
  ambassadorCommPaid: true,
  parentCommPaid: true,
  testFlaggedAt: true,
  testFlaggedById: true,
  testFlagNote: true,
  service: { select: { serviceCode: true } },
  client: {
    select: {
      id: true,
      clientId: true,
      fullName: true,
      email: true,
      userId: true,
      user: {
        select: {
          id: true,
          role: true,
          workerProfile: { select: { id: true } },
          ambassadorProfile: { select: { id: true } },
          execProfile: { select: { id: true } },
          _count: { select: { clientProfiles: true } },
        },
      },
      _count: { select: { projects: true } },
    },
  },
  _count: { select: { childProjects: true } },
} satisfies Prisma.ProjectSelect;

type LoadedProject = Prisma.ProjectGetPayload<{ select: typeof projectSelect }>;

interface Footprint {
  project: LoadedProject;
  facts: CleanupFacts;
  payments: { id: string; paymentId: string; type: string; direction: string; status: string; source: string; amount: number; receiptBlobPath: string | null }[];
  payouts: { id: string; leg: string; recipientType: string; recipientId: string; recipientName: string; amount: number; status: string }[];
  allocations: { id: string; month: string; retainedAmount: number; operationsReserve: number; growthFund: number; reinvestmentFund: number; founderDistribution: number }[];
  expenses: { id: string; category: string; amount: number }[];
  referral: { id: string; ambassadorId: string; status: string; source: string; convertedAt: Date | null; ambassadorName: string } | null;
  files: number;
  aiSpend: number;
  flaggedByName: string | null;
}

/**
 * The whole footprint of each project, read in one batch of queries (the list
 * page, the preview) or inside the delete's transaction under its row lock.
 */
async function loadFootprints(client: Db, ids: string[], now: Date): Promise<Map<string, Footprint>> {
  const out = new Map<string, Footprint>();
  if (ids.length === 0) return out;
  const where = { projectId: { in: ids } };
  const live = { gt: now };

  const [projects, payments, payouts, allocations, expenses, referrals, ai, runs, checkpoints, researchJobs, briefs, qaRuns, chapterChecks, fileCounts, refPdfs, sourcePdfs] = await Promise.all([
    client.project.findMany({ where: { id: { in: ids } }, select: projectSelect }),
    client.payment.findMany({ where, select: { id: true, projectId: true, paymentId: true, type: true, direction: true, status: true, source: true, amount: true, receiptBlobPath: true } }),
    client.payoutRecord.findMany({ where, select: { id: true, projectId: true, leg: true, recipientType: true, recipientId: true, recipientName: true, amount: true, status: true } }),
    client.bucketAllocationLog.findMany({ where, select: { id: true, projectId: true, month: true, retainedAmount: true, operationsReserve: true, growthFund: true, reinvestmentFund: true, founderDistribution: true } }),
    client.expense.findMany({ where, select: { id: true, projectId: true, category: true, amount: true } }),
    client.ambassadorReferral.findMany({ where, select: { id: true, projectId: true, ambassadorId: true, status: true, source: true, convertedAt: true, ambassador: { select: { fullName: true } } } }),
    client.aiUsageLog.groupBy({ by: ["projectId"], where, _sum: { costNaira: true } }),
    client.orchestratorRun.findMany({ where, select: { projectId: true, status: true, lockedUntil: true } }),
    client.generationCheckpoint.findMany({ where: { ...where, lockedUntil: live }, select: { projectId: true } }),
    client.researchJob.findMany({ where: { ...where, lockedUntil: live }, select: { projectId: true } }),
    client.projectBrief.findMany({ where: { ...where, lockedUntil: live }, select: { projectId: true } }),
    client.qaReview.findMany({ where: { ...where, qualityRunLockedUntil: live }, select: { projectId: true } }),
    client.chapterCheck.findMany({ where: { ...where, lockedUntil: live }, select: { projectId: true } }),
    client.projectFile.groupBy({ by: ["projectId"], where, _count: { _all: true } }),
    client.reference.groupBy({ by: ["projectId"], where: { ...where, pdfBlobPath: { not: null } }, _count: { _all: true } }),
    client.projectSource.groupBy({ by: ["projectId"], where: { ...where, pdfPath: { not: null } }, _count: { _all: true } }),
  ]);

  // A quarterly bonus already processed on the quarter the job converted in counted this client.
  const bonusKeys = referrals
    .filter((r) => r.status === "CONVERTED" && r.convertedAt)
    .flatMap((r) => {
      const q = quarterKeyOf(r.convertedAt!);
      return [`platinum:${q}:${r.ambassadorId}`, `challenge:${q}:${r.ambassadorId}`];
    });
  const bonuses = bonusKeys.length
    ? await client.payoutRecord.findMany({ where: { bonusKey: { in: bonusKeys }, status: { not: "CANCELLED" } }, select: { bonusKey: true } })
    : [];
  const processedBonuses = new Set(bonuses.map((b) => b.bonusKey));
  const flaggerIds = projects.map((p) => p.testFlaggedById).filter((x): x is string => Boolean(x));
  const flaggerNames = await namesFor(client, flaggerIds);

  const group = <T extends { projectId: string | null }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) if (r.projectId) m.set(r.projectId, [...(m.get(r.projectId) ?? []), r]);
    return m;
  };
  const paymentsBy = group(payments);
  const payoutsBy = group(payouts);
  const allocationsBy = group(allocations);
  const expensesBy = group(expenses);
  const referralBy = new Map(referrals.map((r) => [r.projectId!, r]));
  const aiBy = new Map(ai.map((a) => [a.projectId!, a._sum.costNaira ?? 0]));
  const runBy = new Map(runs.map((r) => [r.projectId, r]));
  const count = (rows: { projectId: string; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.projectId, r._count._all]));
  const filesBy = count(fileCounts);
  const refPdfsBy = count(refPdfs);
  const sourcePdfsBy = count(sourcePdfs);
  const busy = (rows: { projectId: string }[], label: string) => rows.map((r) => [r.projectId, label] as const);
  const running = new Map<string, string[]>();
  for (const [id, label] of [
    ...busy(checkpoints, "a chapter run"),
    ...busy(researchJobs, "the research run"),
    ...busy(briefs, "the objectives and sources search"),
    ...busy(qaRuns, "the quality gate"),
    ...busy(chapterChecks, "a chapter check"),
  ]) {
    running.set(id, [...(running.get(id) ?? []), label]);
  }

  for (const p of projects) {
    const pays = paymentsBy.get(p.id) ?? [];
    const outs = payoutsBy.get(p.id) ?? [];
    const referral = referralBy.get(p.id) ?? null;
    const run = runBy.get(p.id);
    if (run?.lockedUntil && run.lockedUntil > now) running.set(p.id, [...(running.get(p.id) ?? []), "the report run"]);
    const paystackMoney = pays
      .filter((x) => x.source === "PAYSTACK" && x.direction === "INFLOW" && (x.status === "Confirmed" || x.status === "Duplicate"))
      .reduce((s, x) => s + x.amount, 0);
    const otherMoney = revenueRemoved({ payments: pays.filter((x) => x.source !== "PAYSTACK") });
    const facts: CleanupFacts = {
      code: p.projectId,
      title: p.projectTitle,
      status: p.status,
      isProBono: p.isProBono,
      clientName: p.client.fullName,
      clientEmail: p.client.email,
      flagged: Boolean(p.testFlaggedAt),
      paystackMoney: Math.round(paystackMoney),
      otherMoney,
      paidPayoutAmount: Math.round(outs.filter((o) => o.status === "PAID").reduce((s, o) => s + o.amount, 0)),
      paidFlags: { worker: p.workerPayoutPaid, ambassador: p.ambassadorCommPaid, parent: p.parentCommPaid },
      bonusCounted: Boolean(
        referral?.convertedAt &&
          ["platinum", "challenge"].some((kind) => processedBonuses.has(`${kind}:${quarterKeyOf(referral.convertedAt!)}:${referral.ambassadorId}`))
      ),
      runningWork: running.get(p.id) ?? [],
      orchestratorBusy: run ? BUSY_RUNS[run.status] ?? null : null,
    };
    out.set(p.id, {
      project: p,
      facts,
      payments: pays,
      payouts: outs,
      allocations: allocationsBy.get(p.id) ?? [],
      expenses: expensesBy.get(p.id) ?? [],
      referral: referral ? { id: referral.id, ambassadorId: referral.ambassadorId, status: referral.status, source: referral.source, convertedAt: referral.convertedAt, ambassadorName: referral.ambassador.fullName } : null,
      // Stored files: uploads and copies, reference PDFs, judgment PDFs and the payment receipts.
      files: (filesBy.get(p.id) ?? 0) + (refPdfsBy.get(p.id) ?? 0) + (sourcePdfsBy.get(p.id) ?? 0) + pays.filter((x) => x.receiptBlobPath).length,
      aiSpend: Math.round((aiBy.get(p.id) ?? 0) * 100) / 100,
      flaggedByName: p.testFlaggedById ? flaggerNames.get(p.testFlaggedById) ?? "someone" : null,
    });
  }
  return out;
}

/** The name HQ greets each login by: the executive record, a profile, the display name, else the email. */
async function namesFor(client: Db, userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const users = await client.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      email: true,
      displayName: true,
      execProfile: { select: { fullName: true } },
      workerProfile: { select: { fullName: true } },
      ambassadorProfile: { select: { fullName: true } },
    },
  });
  return new Map(users.map((u) => [u.id, u.execProfile?.fullName ?? u.workerProfile?.fullName ?? u.ambassadorProfile?.fullName ?? u.displayName ?? u.email]));
}

function bucketTotals(allocations: Footprint["allocations"]): DeletionSummary["buckets"] {
  const sum = (k: "operationsReserve" | "growthFund" | "reinvestmentFund" | "founderDistribution" | "retainedAmount") =>
    Math.round(allocations.reduce((s, a) => s + a[k], 0) * 100) / 100;
  return {
    operationsReserve: sum("operationsReserve"),
    growthFund: sum("growthFund"),
    reinvestmentFund: sum("reinvestmentFund"),
    founderDistribution: sum("founderDistribution"),
    retained: sum("retainedAmount"),
  };
}

// ── The list and the preview ───────────────────────────────────────────────

export interface CleanupRow {
  code: string;
  title: string | null;
  status: string;
  createdAt: string;
  clientName: string;
  clientCode: string;
  isProBono: boolean;
  moneyIn: number;
  flagged: { at: string; by: string | null; note: string | null } | null;
  signals: string[];
  refusals: string[];
}

function toRow(f: Footprint): CleanupRow {
  const p = f.project;
  return {
    code: p.projectId,
    title: p.projectTitle,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    clientName: p.client.fullName,
    clientCode: p.client.clientId,
    isProBono: p.isProBono,
    moneyIn: f.facts.paystackMoney + f.facts.otherMoney,
    flagged: p.testFlaggedAt ? { at: p.testFlaggedAt.toISOString(), by: f.flaggedByName, note: p.testFlagNote } : null,
    signals: testSignals({ code: p.projectId, title: p.projectTitle, clientName: p.client.fullName, clientEmail: p.client.email }),
    refusals: cleanupRefusals(f.facts),
  };
}

const NEWEST_OTHERS = 30;

/**
 * Flagged projects first, then the rest: likely tests and the newest projects,
 * or, with a search, whatever matches it.
 */
export async function listCleanupRows(q?: string, now: Date = new Date()): Promise<{ flagged: CleanupRow[]; others: CleanupRow[] }> {
  const search = q?.trim();
  const ids = new Set<string>();
  const pick = (rows: { id: string }[]) => rows.forEach((r) => ids.add(r.id));
  if (search) {
    const contains = { contains: search, mode: "insensitive" as const };
    pick(
      await db.project.findMany({
        where: { OR: [{ projectId: contains }, { projectTitle: contains }, { client: { fullName: contains } }, { client: { clientId: contains } }, { client: { email: contains } }] },
        orderBy: { createdAt: "desc" },
        take: 60,
        select: { id: true },
      })
    );
  } else {
    const test = { contains: "test", mode: "insensitive" as const };
    const [flagged, likely, newest] = await Promise.all([
      db.project.findMany({ where: { testFlaggedAt: { not: null } }, select: { id: true } }),
      db.project.findMany({
        where: {
          OR: [
            { projectId: { startsWith: "EC-QA-" } },
            { projectTitle: test },
            { client: { fullName: test } },
            { client: { email: { endsWith: "@example.com", mode: "insensitive" } } },
          ],
        },
        take: 100,
        select: { id: true },
      }),
      db.project.findMany({ orderBy: { createdAt: "desc" }, take: NEWEST_OTHERS, select: { id: true } }),
    ]);
    pick(flagged);
    pick(likely);
    pick(newest);
  }
  const footprints = await loadFootprints(db, [...ids], now);
  const rows = [...footprints.values()].map(toRow);
  const byNewest = (a: CleanupRow, b: CleanupRow) => b.createdAt.localeCompare(a.createdAt);
  return {
    flagged: rows.filter((r) => r.flagged).sort((a, b) => (b.flagged!.at).localeCompare(a.flagged!.at)),
    others: rows
      .filter((r) => !r.flagged)
      .sort((a, b) => Number(b.signals.length > 0) - Number(a.signals.length > 0) || byNewest(a, b)),
  };
}

export interface CleanupPreview extends CleanupRow {
  warnings: string[];
  removes: {
    payments: { paymentId: string; label: string; amount: number }[];
    buckets: DeletionSummary["buckets"];
    payouts: { label: string; amount: number }[];
    expenses: { label: string; amount: number }[];
    referral: string | null;
    files: number;
  };
  client: { name: string; code: string; deleted: boolean; loginDeleted: boolean; otherProjects: number };
  aiSpendKept: number;
}

function paymentLabel(p: Footprint["payments"][number]): string {
  const kind = p.type === "CLIENT_DOWNPAYMENT" ? "Downpayment" : p.type === "CLIENT_BALANCE" ? "Balance" : p.type === "REFUND" ? "Refund" : p.type.toLowerCase().replace(/_/g, " ");
  return `${kind} · ${p.source === "PAYSTACK" ? "Paystack" : p.source === "MANUAL" ? "recorded by hand" : "system"} · ${p.status}`;
}

/** What deleting these projects would do, project by project, and what stops any of them. Read-only. */
export async function previewDeletion(codes: string[], now: Date = new Date()): Promise<CleanupPreview[]> {
  const projects = await db.project.findMany({ where: { projectId: { in: codes } }, select: { id: true } });
  const footprints = await loadFootprints(db, projects.map((p) => p.id), now);
  const list = [...footprints.values()];

  // A client goes with the last of their projects in this selection (a refused one stays, so it keeps them);
  // their login only if it holds nothing else.
  const selectedPerClient = new Map<string, number>();
  for (const f of list) {
    if (cleanupRefusals(f.facts).length) continue;
    selectedPerClient.set(f.project.client.id, (selectedPerClient.get(f.project.client.id) ?? 0) + 1);
  }

  // An ambassador's tier after every selected conversion of theirs is gone.
  const lostConversions = new Map<string, number>();
  for (const f of list) {
    if (f.referral?.status === "CONVERTED" && !cleanupRefusals(f.facts).length) {
      lostConversions.set(f.referral.ambassadorId, (lostConversions.get(f.referral.ambassadorId) ?? 0) + 1);
    }
  }
  const tierDrops = new Map<string, { name: string; from: string; to: string }>();
  if (lostConversions.size) {
    const [ambassadors, execIndex] = await Promise.all([
      db.ambassador.findMany({
        where: { id: { in: [...lostConversions.keys()] } },
        select: { id: true, fullName: true, tier: true, lifetimeConversions: true, email: true, user: { select: { email: true, role: true } } },
      }),
      loadExecIndex(),
    ]);
    for (const a of ambassadors) {
      const after = ambassadorTier(Math.max(0, a.lifetimeConversions - (lostConversions.get(a.id) ?? 0)), execForRecord(execIndex, a) != null);
      if (after !== a.tier) tierDrops.set(a.id, { name: a.fullName, from: tierName(a.tier), to: tierName(after) });
    }
  }

  return list
    .map((f): CleanupPreview => {
      const row = toRow(f);
      const p = f.project;
      const otherProjects = p.client._count.projects - (selectedPerClient.get(p.client.id) ?? 0);
      const user = p.client.user;
      const loginDeleted =
        otherProjects === 0 && Boolean(user) && user!.role === "CLIENT" && !user!.workerProfile && !user!.ambassadorProfile && !user!.execProfile && user!._count.clientProfiles <= 1;
      const drop = f.referral?.status === "CONVERTED" ? tierDrops.get(f.referral.ambassadorId) : undefined;
      return {
        ...row,
        warnings: cleanupWarnings({
          code: p.projectId,
          status: p.status,
          flagged: Boolean(p.testFlaggedAt),
          signals: row.signals,
          otherMoney: f.facts.otherMoney,
          hasWorker: Boolean(p.workerId),
          hasLineage: Boolean(p.parentProjectId) || p._count.childProjects > 0,
          aiSpendKept: f.aiSpend,
          tierDrops: drop ? [drop] : [],
        }),
        removes: {
          payments: f.payments.map((x) => ({ paymentId: x.paymentId, label: paymentLabel(x), amount: x.amount })),
          buckets: bucketTotals(f.allocations),
          payouts: f.payouts.map((o) => ({ label: `${legLabel(o.leg)} · ${o.recipientName} · ${o.status.toLowerCase()}`, amount: o.amount })),
          expenses: f.expenses.map((e) => ({ label: e.category, amount: e.amount })),
          referral: f.referral
            ? `${f.referral.ambassadorName}'s referral (${f.referral.status.toLowerCase()})${f.referral.source === "HOG" ? " goes back to their pending list" : " is removed"}`
            : null,
          files: f.files,
        },
        client: { name: p.client.fullName, code: p.client.clientId, deleted: otherProjects === 0, loginDeleted, otherProjects },
        aiSpendKept: f.aiSpend,
      };
    })
    .sort((a, b) => codes.indexOf(a.code) - codes.indexOf(b.code));
}

function tierName(tier: string): string {
  return tier.charAt(0) + tier.slice(1).toLowerCase();
}

function legLabel(leg: string): string {
  switch (leg) {
    case "WORKER":
      return "Specialist";
    case "AMBASSADOR":
      return "Ambassador";
    case "PARENT":
      return "Core ambassador";
    default:
      return leg;
  }
}

// ── The delete ─────────────────────────────────────────────────────────────

export interface Actor {
  userId: string;
  name: string;
}

export interface DeleteResult {
  code: string;
  ok: boolean;
  error?: string;
  refusals?: string[];
  summary?: DeletionSummary;
  line?: string;
  clientDeleted?: boolean;
  loginDeleted?: boolean;
}

/**
 * Delete these projects, one transaction each, so one refusal never undoes
 * another. The reason and the typed phrase are checked here too, not only in
 * the dialog.
 */
export async function deleteTestProjects(codes: string[], reason: string, confirm: string, actor: Actor): Promise<DeleteResult[]> {
  const unique = [...new Set(codes)];
  if (unique.length === 0) throw new CleanupError("Pick at least one project.");
  if (!reasonIsValid(reason)) throw new CleanupError("Give a reason of at least 5 characters.");
  if (!confirmMatches(confirm, unique)) throw new CleanupError(`Type ${confirmPhrase(unique)} to confirm.`);

  const results: DeleteResult[] = [];
  for (const code of unique) {
    try {
      results.push(await deleteOne(code, reason.trim(), actor));
    } catch (error) {
      if (error instanceof CleanupError) {
        results.push({ code, ok: false, error: error.message, refusals: error.refusals.length ? error.refusals : undefined });
      } else {
        console.error(`[cleanup] ${code} not deleted`, error);
        results.push({ code, ok: false, error: "Something went wrong; nothing was deleted for this project. Try again." });
      }
    }
  }

  const done = results.filter((r) => r.ok);
  if (done.length) {
    // The deletes are committed; a cache that can't be flushed only means figures refresh within 10 minutes.
    try {
      revalidateCommandCenter();
    } catch (error) {
      console.warn("[cleanup] Command Center cache not flushed", error instanceof Error ? error.message : error);
    }
    const revenue = done.reduce((s, r) => s + (r.summary ? revenueRemoved(r.summary) : 0), 0);
    await notifyFinance({
      title: done.length === 1 ? `Test project ${done[0].code} deleted` : `${done.length} test projects deleted`,
      message: `${actor.name} deleted ${done.map((r) => r.code).join(", ")} as test data. ${revenue ? `Revenue is ${formatNaira(revenue)} lower.` : "No confirmed revenue was on them."} Reason: ${reason.trim()}`,
      type: "info",
      link: "/admin/settings/cleanup",
    }).catch((error) => console.warn("[cleanup] finance not told", error instanceof Error ? error.message : error));
  }
  return results;
}

async function deleteOne(code: string, reason: string, actor: Actor): Promise<DeleteResult> {
  const found = await db.project.findUnique({ where: { projectId: code }, select: { id: true } });
  if (!found) throw new CleanupError(`${code} no longer exists.`, 404);
  const projectDbId = found.id;
  const files = await storedFilesOf(projectDbId);
  const now = new Date();

  const outcome = await db.$transaction(
    async (tx) => {
      await lockProjectRow(tx, projectDbId);
      const f = (await loadFootprints(tx, [projectDbId], now)).get(projectDbId);
      if (!f) throw new CleanupError(`${code} no longer exists.`, 404);
      const refusals = cleanupRefusals(f.facts);
      if (refusals.length) throw new CleanupError(`${code} can't be deleted.`, 409, refusals);
      const p = f.project;

      // Every ambassador the project touched, and where they stood before.
      const ambassadorIds = [
        ...new Set(
          [p.ambassadorId, p.parentAmbassadorId, f.referral?.ambassadorId, ...f.payouts.filter((o) => o.recipientType === "AMBASSADOR").map((o) => o.recipientId)].filter(
            (x): x is string => Boolean(x)
          )
        ),
      ];
      const before = await tx.ambassador.findMany({ where: { id: { in: ambassadorIds } }, select: { id: true, fullName: true, tier: true, lifetimeConversions: true } });

      // Buckets: give the month mirrors back, then drop the ledger rows and the allocation log (RESTRICT on the project).
      for (const a of f.allocations) {
        await tx.bucketBalance.updateMany({
          where: { month: a.month },
          data: {
            operationsReserve: { decrement: a.operationsReserve },
            growthFund: { decrement: a.growthFund },
            reinvestmentFund: { decrement: a.reinvestmentFund },
            founderDistribution: { decrement: a.founderDistribution },
          },
        });
      }
      await tx.bucketTransaction.deleteMany({
        where: {
          OR: [
            { projectId: projectDbId },
            { allocationId: { in: f.allocations.map((a) => a.id) } },
            { paymentId: { in: f.payments.map((x) => x.id) } },
            { expenseId: { in: f.expenses.map((e) => e.id) } },
          ],
        },
      });
      await tx.bucketAllocationLog.deleteMany({ where: { projectId: projectDbId } });

      // Payout records go outright (a cancelled one left behind would read as a bonus), then the commission lines.
      await tx.payoutRecord.deleteMany({ where: { projectId: projectDbId } });
      await tx.expense.deleteMany({ where: { projectId: projectDbId } });

      // Payments (only hand-recorded, system or unpaid Paystack rows are left after the refusals).
      await tx.payment.deleteMany({ where: { projectId: projectDbId } });

      // The referral: an entry the HOG logged by hand goes back to their pending list; one the order created goes.
      if (f.referral) {
        if (f.referral.source === "HOG") {
          await tx.ambassadorReferral.update({ where: { id: f.referral.id }, data: { projectId: null, status: "PENDING", convertedAt: null, projectValue: null } });
        } else {
          await tx.ambassadorReferral.delete({ where: { id: f.referral.id } });
        }
      }

      await tx.workerFlag.deleteMany({ where: { projectId: projectDbId } });
      // RESTRICT on the project; its references cascade.
      await tx.researchJob.deleteMany({ where: { projectId: projectDbId } });
      await tx.emailLog.deleteMany({ where: { projectId: projectDbId } });
      await tx.setting.deleteMany({ where: { key: { endsWith: `:${projectDbId}` } } });

      // Notifications only name a project in their text.
      const candidates = await tx.notification.findMany({
        where: { OR: [{ link: { contains: code } }, { title: { contains: code } }, { message: { contains: code } }, { link: { contains: projectDbId } }] },
        select: { id: true, link: true, title: true, message: true },
      });
      const notificationIds = candidates
        .filter((n) => mentionsProject(n.link, code) || mentionsProject(n.title, code) || mentionsProject(n.message, code) || Boolean(n.link?.includes(projectDbId)))
        .map((n) => n.id);
      if (notificationIds.length) await tx.notification.deleteMany({ where: { id: { in: notificationIds } } });

      await tx.project.delete({ where: { id: projectDbId } });

      // The client goes with their last project.
      const clientLeft = await tx.project.count({ where: { clientId: p.client.id } });
      const clientDeleted = clientLeft === 0;
      if (clientDeleted) await tx.client.delete({ where: { id: p.client.id } });

      // Recount everyone the project touched. A tier only this project earned is taken back with its history.
      const ambassadors: DeletionSummary["ambassadors"] = [];
      for (const b of before) {
        const r = await recountAmbassador(tx, b.id);
        if (!r) continue;
        if (r.tierChanged) {
          const promotion = await tx.ambassadorTierLog.findFirst({
            where: { ambassadorId: b.id, toTier: r.previousTier, conversions: { gt: r.lifetimeConversions } },
            orderBy: { createdAt: "desc" },
            select: { id: true },
          });
          if (promotion) {
            const demotion = await tx.ambassadorTierLog.findFirst({
              where: { ambassadorId: b.id, fromTier: r.previousTier, toTier: r.tier, createdAt: { gte: now } },
              orderBy: { createdAt: "desc" },
              select: { id: true },
            });
            await tx.ambassadorTierLog.deleteMany({ where: { id: { in: [promotion.id, ...(demotion ? [demotion.id] : [])] } } });
          }
        }
        if (r.tierChanged || r.lifetimeConversions !== b.lifetimeConversions) {
          ambassadors.push({ name: b.fullName, tierBefore: b.tier, tierAfter: r.tier, conversionsBefore: b.lifetimeConversions, conversionsAfter: r.lifetimeConversions });
        }
      }

      const summary: DeletionSummary = {
        payments: f.payments.map((x) => ({ paymentId: x.paymentId, type: x.type, source: x.source, status: x.status, amount: x.amount, direction: x.direction })),
        buckets: bucketTotals(f.allocations),
        payouts: f.payouts.map((o) => ({ leg: o.leg, recipientName: o.recipientName, amount: o.amount, status: o.status })),
        expenses: f.expenses.map((e) => ({ category: e.category, amount: e.amount })),
        referral: f.referral ? { ambassadorName: f.referral.ambassadorName, status: f.referral.status, action: f.referral.source === "HOG" ? "unlinked" : "deleted" } : null,
        ambassadors,
        files: files.private.length + files.public.length,
        notifications: notificationIds.length,
        aiSpendKept: f.aiSpend,
      };

      await tx.deletedProject.create({
        data: {
          projectCode: p.projectId,
          projectDbId,
          title: p.projectTitle,
          serviceCode: p.service.serviceCode,
          status: p.status,
          price: p.price,
          isProBono: p.isProBono,
          clientCode: p.client.clientId,
          clientName: p.client.fullName,
          clientEmail: p.client.email,
          clientDeleted,
          projectCreatedAt: p.createdAt,
          flaggedById: p.testFlaggedById,
          flaggedByName: f.flaggedByName,
          flagNote: p.testFlagNote,
          reason,
          summary: summary as unknown as Prisma.InputJsonValue,
          deletedById: actor.userId,
          deletedByName: actor.name,
        },
      });

      return { summary, clientDeleted, clientUserId: p.client.userId };
    },
    // The shared pooler is slow from far away; one project is a few dozen statements.
    { timeout: 90_000, maxWait: 20_000 }
  );

  // A login that only ever held this client's orders goes too; anything else keeps it.
  let loginDeleted = false;
  if (outcome.clientDeleted && outcome.clientUserId) {
    loginDeleted = await removeClientOnlyLogin(outcome.clientUserId);
    if (loginDeleted) await db.deletedProject.update({ where: { projectDbId }, data: { loginDeleted: true } });
  }

  await removeStoredFiles(code, files);
  const line = summaryLine(outcome.summary);
  console.log(`[cleanup] ${code} deleted by ${actor.name}: ${line}${outcome.clientDeleted ? " Client deleted." : ""}${loginDeleted ? " Login deleted." : ""}`);
  return { code, ok: true, summary: outcome.summary, line, clientDeleted: outcome.clientDeleted, loginDeleted };
}

async function removeClientOnlyLogin(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      workerProfile: { select: { id: true } },
      ambassadorProfile: { select: { id: true } },
      execProfile: { select: { id: true } },
      _count: { select: { clientProfiles: true } },
    },
  });
  if (!user || user.role !== "CLIENT" || user.workerProfile || user.ambassadorProfile || user.execProfile || user._count.clientProfiles > 0) return false;
  try {
    await db.user.delete({ where: { id: userId } });
    return true;
  } catch (error) {
    // Something still points at it (a payment it confirmed, say): switch it off instead.
    console.warn("[cleanup] client login kept, switched off", error instanceof Error ? error.message : error);
    await db.user.update({ where: { id: userId }, data: { isActive: false } }).catch(() => undefined);
    return false;
  }
}

// ── Files ──────────────────────────────────────────────────────────────────

interface StoredFiles {
  private: string[];
  public: string[];
}

/** The public intake store's host, read from its token the way @vercel/blob does. */
function ourPublicBlobHost(): string | null {
  const storeId = (process.env.BLOB_READ_WRITE_TOKEN ?? "").split("_")[3];
  return storeId ? `${storeId.toLowerCase()}.public.blob.vercel-storage.com` : null;
}

async function storedFilesOf(projectDbId: string): Promise<StoredFiles> {
  const [files, references, sources, payments] = await Promise.all([
    db.projectFile.findMany({ where: { projectId: projectDbId }, select: { blobPathname: true, fileUrl: true } }),
    db.reference.findMany({ where: { projectId: projectDbId, pdfBlobPath: { not: null } }, select: { pdfBlobPath: true } }),
    db.projectSource.findMany({ where: { projectId: projectDbId, pdfPath: { not: null } }, select: { pdfPath: true } }),
    db.payment.findMany({ where: { projectId: projectDbId, receiptBlobPath: { not: null } }, select: { receiptBlobPath: true } }),
  ]);
  const host = ourPublicBlobHost();
  const isOurPublicBlob = (url: string) => {
    try {
      return Boolean(host) && new URL(url).hostname.toLowerCase() === host;
    } catch {
      return false;
    }
  };
  return {
    private: [
      ...files.map((f) => f.blobPathname),
      ...references.map((r) => r.pdfBlobPath),
      ...sources.map((s) => s.pdfPath),
      ...payments.map((x) => x.receiptBlobPath),
    ].filter((x): x is string => Boolean(x)),
    public: files.filter((f) => !f.blobPathname && isOurPublicBlob(f.fileUrl)).map((f) => f.fileUrl),
  };
}

/** After the commit: an orphaned file is harmless, a row pointing at a missing file is not. */
async function removeStoredFiles(code: string, files: StoredFiles): Promise<void> {
  let failed = 0;
  for (const path of files.private) {
    await deleteStoredFile(path).catch(() => {
      failed += 1;
    });
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (files.public.length && token) {
    await del(files.public, { token }).catch(() => {
      failed += files.public.length;
    });
  }
  if (failed) console.warn(`[cleanup] ${code}: ${failed} stored file(s) could not be removed`);
}

// ── Flags ──────────────────────────────────────────────────────────────────

/** Put a project at the top of the founder's list. Changes nothing else. */
export async function flagTestProject(rawCode: string, note: string | undefined, actor: Actor): Promise<{ code: string; already: boolean }> {
  const code = normalizeProjectCode(rawCode);
  if (!code) throw new CleanupError("Type a project code like EC-00007.");
  const project = await db.project.findUnique({ where: { projectId: code }, select: { id: true, testFlaggedAt: true } });
  if (!project) throw new CleanupError(CLEANUP_TEXT.flagMissing, 404);
  if (project.testFlaggedAt) return { code, already: true };
  const trimmed = note?.trim().slice(0, 500) || null;
  const claimed = await db.project.updateMany({
    where: { id: project.id, testFlaggedAt: null },
    data: { testFlaggedAt: new Date(), testFlaggedById: actor.userId, testFlagNote: trimmed },
  });
  if (claimed.count === 1) {
    await notifyRole("SUPER_ADMIN", {
      title: "Test project flagged",
      message: `${actor.name} flagged ${code} as a test project${trimmed ? `: ${trimmed}` : "."}`,
      type: "info",
      link: "/admin/settings/cleanup",
    }).catch((error) => console.warn("[cleanup] founder not told of flag", error instanceof Error ? error.message : error));
  }
  return { code, already: claimed.count === 0 };
}

export async function unflagTestProject(rawCode: string): Promise<{ code: string }> {
  const code = normalizeProjectCode(rawCode);
  if (!code) throw new CleanupError("Type a project code like EC-00007.");
  const project = await db.project.findUnique({ where: { projectId: code }, select: { id: true } });
  if (!project) throw new CleanupError(CLEANUP_TEXT.flagMissing, 404);
  await db.project.update({ where: { id: project.id }, data: { testFlaggedAt: null, testFlaggedById: null, testFlagNote: null } });
  return { code };
}

/** Who flagged a project, for the unflag permission check. */
export async function flagOf(rawCode: string): Promise<{ code: string; flaggedById: string | null } | null> {
  const code = normalizeProjectCode(rawCode);
  if (!code) return null;
  const project = await db.project.findUnique({ where: { projectId: code }, select: { testFlaggedById: true } });
  return project ? { code, flaggedById: project.testFlaggedById } : null;
}

// ── Who may flag ───────────────────────────────────────────────────────────

export interface FlaggerRow {
  userId: string;
  name: string;
  email: string;
  role: string;
  byRole: boolean;
  appointedAt: string | null;
}

export async function listFlaggers(): Promise<FlaggerRow[]> {
  const users = await db.user.findMany({
    where: { OR: [{ canFlagTestProjects: true }, { role: { in: ["COO", "OPS_MANAGER"] }, isActive: true }] },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, role: true, canFlagTestProjects: true, flagAppointedAt: true },
  });
  const names = await namesFor(db, users.map((u) => u.id));
  return users.map((u) => ({
    userId: u.id,
    name: names.get(u.id) ?? u.email,
    email: u.email,
    role: u.role,
    byRole: u.role === "COO" || u.role === "OPS_MANAGER",
    appointedAt: u.flagAppointedAt?.toISOString() ?? null,
  }));
}

/** Appoint someone by their login email, worker ID or ambassador ID. */
export async function appointFlagger(identifier: string, actorId: string): Promise<{ name: string }> {
  const parsed = parseFlaggerIdentifier(identifier);
  if (!parsed) throw new CleanupError("Type a login email, a worker ID (ECW-0003) or an ambassador ID (EC-A-00030).");
  let userId: string | null = null;
  if (parsed.kind === "email") {
    userId = (await db.user.findFirst({ where: { email: { equals: parsed.email, mode: "insensitive" } }, select: { id: true } }))?.id ?? null;
  } else if (parsed.kind === "worker") {
    userId = (await db.worker.findUnique({ where: { workerId: parsed.code }, select: { userId: true } }))?.userId ?? null;
  } else {
    userId = (await db.ambassador.findUnique({ where: { ambassadorId: parsed.code }, select: { userId: true } }))?.userId ?? null;
  }
  if (!userId) throw new CleanupError("No login found for that email or ID. They need a login to flag projects.", 404);
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true, isActive: true } });
  if (!user) throw new CleanupError("No login found for that email or ID.", 404);
  if (!user.isActive) throw new CleanupError("That login is switched off.");
  if (user.role === "SUPER_ADMIN") throw new CleanupError("You can already flag and delete.");
  if (user.role === "COO" || user.role === "OPS_MANAGER") throw new CleanupError("The COO can always flag test projects.");
  if (user.role === "CLIENT") throw new CleanupError("A client login can't be appointed.");
  await db.user.update({ where: { id: user.id }, data: { canFlagTestProjects: true, flagAppointedAt: new Date(), flagAppointedById: actorId } });
  return { name: (await namesFor(db, [user.id])).get(user.id) ?? "them" };
}

export async function removeFlagger(userId: string): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { canFlagTestProjects: true, role: true } });
  if (!user) throw new CleanupError("No such login.", 404);
  if (user.role === "COO" || user.role === "OPS_MANAGER") throw new CleanupError("The COO flags by role; change their role on Team & roles instead.");
  await db.user.update({ where: { id: userId }, data: { canFlagTestProjects: false, flagAppointedAt: null, flagAppointedById: null } });
}

// ── History ────────────────────────────────────────────────────────────────

export interface DeletedRow {
  code: string;
  title: string | null;
  clientName: string | null;
  clientCode: string | null;
  clientDeleted: boolean;
  loginDeleted: boolean;
  status: string;
  price: number;
  reason: string;
  deletedByName: string;
  deletedAt: string;
  flaggedByName: string | null;
  summary: DeletionSummary;
  line: string;
}

export async function listDeletedProjects(): Promise<DeletedRow[]> {
  const rows = await db.deletedProject.findMany({ orderBy: { deletedAt: "desc" }, take: 200 });
  return rows.map((r) => {
    const summary = r.summary as unknown as DeletionSummary;
    return {
      code: r.projectCode,
      title: r.title,
      clientName: r.clientName,
      clientCode: r.clientCode,
      clientDeleted: r.clientDeleted,
      loginDeleted: r.loginDeleted,
      status: r.status,
      price: r.price,
      reason: r.reason,
      deletedByName: r.deletedByName,
      deletedAt: r.deletedAt.toISOString(),
      flaggedByName: r.flaggedByName,
      summary,
      line: summaryLine(summary),
    };
  });
}

/** Who flagged a project, as the project page names them. */
export async function displayNameOf(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  return (await namesFor(db, [userId])).get(userId) ?? null;
}

/** The name the founder is recorded under. */
export async function actorFor(userId: string): Promise<Actor> {
  return { userId, name: (await namesFor(db, [userId])).get(userId) ?? "The founder" };
}
