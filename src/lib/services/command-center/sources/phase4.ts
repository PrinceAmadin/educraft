import { db } from "@/lib/db";
import { DAY_MS, HOUR_MS, hoursBetween } from "@/lib/command-center/time";
import {
  MAX_CORRECTION_ROUNDS,
  QA_OVERDUE_HOURS,
  TIER2_FLAG_WARNING,
  TIER2_FLAG_WINDOW_DAYS,
  currentCorrectionRound,
} from "@/lib/command-center/derive";
import type { CcAlert, FeedEvent } from "@/lib/command-center/types";
import { afterMerge } from "./merge-guard";

/**
 * Phase 4 (Operations Platform) sources for the Command Center.
 *
 * `WorkerFlag`, `QaReview`, `SupervisorCorrection` and `ResearchRequest`
 * come with the phase-4 branch, which is not merged or migrated yet. Each
 * query on them is written against phase-4's schema and marked
 * `// requires Phase 4 merge`. This branch's Prisma client does not know
 * those models, so the queries reach them through `p4` — `db` seen through
 * the few methods used here — and `afterMerge` skips them until the schema
 * has them (see merge-guard.ts). After the merge and `npm run db:migrate`
 * they run as written; change the `p4` line to `const p4 = db;` to have tsc
 * check them against the real schema.
 *
 * Every function still answers on this branch: from main's own records
 * where they give the same figure, or null ("Awaiting data").
 */

// requires Phase 4 merge: the models phase-4 adds, as this file uses them.
interface Phase4Models {
  workerFlag: { groupBy(args: object): Promise<unknown> };
  qaReview: { findMany(args: object): Promise<unknown> };
  supervisorCorrection: { groupBy(args: object): Promise<unknown> };
  researchRequest: { findMany(args: object): Promise<unknown> };
}
const p4 = db as unknown as Phase4Models;

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ── Tier 2 reference flags ────────────────────────────────────────

export interface Tier2FlagCounts {
  /** Open Tier 2 flags raised in the window, all workers. */
  total: number;
  /** The same, per Worker.id. */
  byWorker: Map<string, number>;
}

/**
 * Tier 2 reference flags raised in the last 30 days and not yet resolved,
 * counted from the dated `WorkerFlag` records (there is no counter column).
 * A flag the COO has resolved drops out, as on the worker's profile and in
 * the Workers directory (Phase 4's `tier2FlagCounts`). Null before the merge.
 */
export async function tier2FlagCounts(now: Date): Promise<Tier2FlagCounts | null> {
  const since = new Date(now.getTime() - TIER2_FLAG_WINDOW_DAYS * DAY_MS);
  return afterMerge(4, "WorkerFlag", [{ model: "WorkerFlag" }], async () => {
    // requires Phase 4 merge: WorkerFlag (kind TIER2_REFERENCE, createdAt, resolvedAt).
    const rows = await p4.workerFlag.groupBy({
      by: ["workerId"],
      where: { kind: "TIER2_REFERENCE", createdAt: { gte: since }, resolvedAt: null },
      _count: { _all: true },
    });
    // Cast apart from the call: an assertion on the call itself breaks Prisma's groupBy inference.
    const groups = rows as { workerId: string; _count: { _all: number } }[];
    return {
      total: groups.reduce((sum, g) => sum + g._count._all, 0),
      byWorker: new Map(groups.map((g) => [g.workerId, g._count._all])),
    };
  });
}

/**
 * CRITICAL: a worker who can take work (Active or On Break) with 3 or more
 * open Tier 2 reference flags in 30 days — a systemic quality risk. One row
 * per worker, most flags first. Null before the merge.
 */
export async function workerTier2FlagAlerts(now: Date): Promise<CcAlert[] | null> {
  const counts = await tier2FlagCounts(now);
  if (!counts) return null;
  const over = [...counts.byWorker].filter(([, n]) => n >= TIER2_FLAG_WARNING);
  if (over.length === 0) return [];
  const workers = await db.worker.findMany({
    where: { id: { in: over.map(([id]) => id) }, status: { in: ["Active", "On Break"] } },
    select: { id: true, fullName: true },
  });
  return workers
    .map((w) => ({ w, n: counts.byWorker.get(w.id) ?? 0 }))
    .sort((a, b) => b.n - a.n || a.w.fullName.localeCompare(b.w.fullName))
    .map(({ w, n }) => ({
      key: `worker_flags:${w.id}`,
      severity: "critical" as const,
      kind: "worker_flags" as const,
      title: `${w.fullName}: ${n} Tier 2 reference flags in 30 days`,
      detail: "Systemic quality risk — open flags on their reference work",
      meta: "COO action needed",
      href: `/admin/workers/${w.id}`,
      hrefLabel: "Go to worker",
    }));
}

// ── QA queue ──────────────────────────────────────────────────────

/**
 * ATTENTION: submissions waiting 24 hours or more with no QA reviewer. Age
 * runs from the latest move into SUBMITTED (else `updatedAt`), exactly as
 * Phase 4's QA queue ages them. On main, SUBMITTED alone means nobody has
 * the review (taking it moves the project to IN_QA_REVIEW); Phase 4 also
 * lets the COO assign a reviewer while the project is still SUBMITTED, and
 * keeps the reviewer on a resubmission, so after the merge those are left
 * out (the queue's "assigned" rows).
 */
export async function qaWaitingWithoutReviewer(
  now: Date,
  hours = QA_OVERDUE_HOURS
): Promise<{ count: number; oldestHours: number | null }> {
  const rows = await db.project.findMany({
    where: { status: "SUBMITTED" },
    select: {
      id: true,
      updatedAt: true,
      statusLog: { where: { toStatus: "SUBMITTED" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });
  const cutoff = now.getTime() - hours * HOUR_MS;
  const waiting = rows
    .map((r) => ({ id: r.id, since: r.statusLog[0]?.createdAt ?? r.updatedAt }))
    .filter((r) => r.since.getTime() <= cutoff);

  const assigned = await afterMerge(4, "QaReview", [{ model: "QaReview" }], async () => {
    if (waiting.length === 0) return new Set<string>();
    // requires Phase 4 merge: QaReview.reviewerId (a reviewer assigned before the review starts).
    const reviews = (await p4.qaReview.findMany({
      where: { projectId: { in: waiting.map((w) => w.id) }, reviewerId: { not: null } },
      select: { projectId: true },
    })) as { projectId: string }[];
    return new Set(reviews.map((r) => r.projectId));
  });

  let count = 0;
  let oldest: number | null = null;
  for (const w of waiting) {
    if (assigned?.has(w.id)) continue;
    count += 1;
    const age = hoursBetween(w.since, now);
    if (oldest === null || age > oldest) oldest = age;
  }
  return { count, oldestHours: oldest === null ? null : Math.floor(oldest) };
}

export type QaDecision = "APPROVED" | "REVISION_NEEDED" | "MINOR_FIXES" | "ESCALATED";

const QA_DECISIONS: readonly string[] = ["APPROVED", "REVISION_NEEDED", "MINOR_FIXES", "ESCALATED"];

export interface QaDecisionToday {
  /** Project.id */
  projectId: string;
  /** "EC-00289" */
  projectCode: string;
  workerName: string | null;
  decision: QaDecision;
  reviewerName: string | null;
  /** Delivery checks ticked when the decision was made. */
  checksTicked: number;
  allChecksPassed: boolean;
  /** 1 on a first submission, 2 after one revision, … */
  round: number;
  at: Date;
}

/** Ticked items in a `{ d1: true, d2: false, … }` checklist. */
function ticked(checklist: unknown): number {
  if (typeof checklist !== "object" || checklist === null || Array.isArray(checklist)) return 0;
  return Object.values(checklist).filter((v) => v === true).length;
}

/**
 * Today's QA decisions from Phase 4's review record. Approvals, minor-fix
 * approvals and revisions stamp `completedAt`; an escalation keeps the
 * review open (no stamp), so it is found by `updatedAt`. There is one review
 * row per project (a resubmission reopens it as the next round), so the
 * status log stays the full record of moves and these rows add the reviewer
 * and the checklist to the latest one. Null before the merge.
 */
export async function qaDecisionsToday(dayStart: Date): Promise<QaDecisionToday[] | null> {
  return afterMerge(4, "QaReview", [{ model: "QaReview" }], async () => {
    // requires Phase 4 merge: QaReview (decision, completedAt, reviewerName, deliveryChecklist, round).
    const rows = (await p4.qaReview.findMany({
      where: {
        OR: [
          { completedAt: { gte: dayStart }, decision: { in: ["APPROVED", "MINOR_FIXES", "REVISION_NEEDED"] } },
          { decision: "ESCALATED", updatedAt: { gte: dayStart } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        projectId: true,
        decision: true,
        reviewerName: true,
        deliveryChecklist: true,
        allChecksPassed: true,
        round: true,
        completedAt: true,
        updatedAt: true,
        project: { select: { projectId: true, worker: { select: { fullName: true } } } },
      },
    })) as {
      projectId: string;
      decision: string | null;
      reviewerName: string | null;
      deliveryChecklist: unknown;
      allChecksPassed: boolean;
      round: number;
      completedAt: Date | null;
      updatedAt: Date;
      project: { projectId: string; worker: { fullName: string } | null };
    }[];
    return rows.flatMap((r) =>
      r.decision !== null && QA_DECISIONS.includes(r.decision)
        ? [
            {
              projectId: r.projectId,
              projectCode: r.project.projectId,
              workerName: r.project.worker?.fullName ?? null,
              decision: r.decision as QaDecision,
              reviewerName: r.reviewerName,
              checksTicked: ticked(r.deliveryChecklist),
              allChecksPassed: r.allChecksPassed,
              round: r.round,
              at: r.completedAt ?? r.updatedAt,
            },
          ]
        : []
    );
  });
}

// ── Supervisor corrections ────────────────────────────────────────

export interface CorrectionRoundProject {
  id: string;
  projectId: string;
  projectTitle: string | null;
  clientName: string;
  serviceName: string;
  round: number;
}

/**
 * ATTENTION: projects on their third (last included) round of supervisor
 * corrections. The round is `currentCorrectionRound` of Phase 4's
 * `SupervisorCorrection` rows and the older `supervisorCorrectionCount`;
 * before the merge, from the counter alone.
 */
export async function correctionRoundThreeProjects(): Promise<CorrectionRoundProject[]> {
  const rows = await db.project.findMany({
    where: { status: "SUPERVISOR_CORRECTIONS" },
    orderBy: { updatedAt: "asc" },
    select: {
      id: true,
      projectId: true,
      projectTitle: true,
      supervisorCorrectionCount: true,
      client: { select: { fullName: true } },
      service: { select: { serviceName: true } },
    },
  });
  if (rows.length === 0) return [];
  const latest = await afterMerge(4, "SupervisorCorrection", [{ model: "SupervisorCorrection" }], async () => {
    // requires Phase 4 merge: SupervisorCorrection.roundNumber (one row per round).
    const maxRounds = await p4.supervisorCorrection.groupBy({
      by: ["projectId"],
      where: { projectId: { in: rows.map((r) => r.id) } },
      _max: { roundNumber: true },
    });
    const groups = maxRounds as { projectId: string; _max: { roundNumber: number | null } }[];
    return new Map(groups.map((g) => [g.projectId, g._max.roundNumber ?? 0]));
  });
  return rows.flatMap((r) => {
    const round = currentCorrectionRound(latest?.get(r.id) ?? 0, r.supervisorCorrectionCount);
    if (round < MAX_CORRECTION_ROUNDS) return [];
    return [
      {
        id: r.id,
        projectId: r.projectId,
        projectTitle: r.projectTitle,
        clientName: r.client.fullName,
        serviceName: r.service.serviceName,
        round,
      },
    ];
  });
}

/**
 * Correction rounds recorded per project in Phase 4's `SupervisorCorrection`
 * table, for supervisor acceptance. Null before the merge: there is no
 * table, so no rounds are recorded in it and the older counter is the
 * whole story.
 */
export async function correctionRoundCounts(projectIds: readonly string[]): Promise<Map<string, number> | null> {
  return afterMerge(4, "SupervisorCorrection", [{ model: "SupervisorCorrection" }], async () => {
    if (projectIds.length === 0) return new Map<string, number>();
    // requires Phase 4 merge: SupervisorCorrection, one row per round.
    const counts = await p4.supervisorCorrection.groupBy({
      by: ["projectId"],
      where: { projectId: { in: [...projectIds] } },
      _count: { _all: true },
    });
    const groups = counts as { projectId: string; _count: { _all: number } }[];
    return new Map(groups.map((g) => [g.projectId, g._count._all]));
  });
}

// ── Research ledger ───────────────────────────────────────────────

interface LedgerRow {
  id: string;
  status: string;
  rerunRequestId: string | null;
  approvedAt: Date | null;
  deniedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  totalReferences: number | null;
  openAccessCount: number | null;
  pipelineLog: unknown;
  project: { id: string; projectId: string };
}

/** The ledger closes a run a re-run replaced with this message (`ledgerRunStarted`). */
function replacedByRerun(pipelineLog: unknown): boolean {
  if (typeof pipelineLog !== "object" || pipelineLog === null) return false;
  const message = (pipelineLog as { errorMessage?: unknown }).errorMessage;
  return typeof message === "string" && message.startsWith("Replaced by a re-run");
}

/**
 * Today's research activity from Phase 4's run ledger (`ResearchRequest`):
 * re-runs approved or declined, runs started, runs finished. A free first
 * run is approved automatically (`approvedAt` equals `startedAt`), so it
 * shows as started, never as an approval. Null before the merge; the caller
 * then reads main's re-run requests and research jobs.
 */
export async function researchEventsToday(dayStart: Date): Promise<FeedEvent[] | null> {
  return afterMerge(4, "ResearchRequest", [{ model: "ResearchRequest" }], async () => {
    // requires Phase 4 merge: ResearchRequest (approvedAt, deniedAt, startedAt, completedAt, totalReferences).
    const rows = (await p4.researchRequest.findMany({
      where: {
        OR: [
          { approvedAt: { gte: dayStart } },
          { deniedAt: { gte: dayStart } },
          { startedAt: { gte: dayStart } },
          { completedAt: { gte: dayStart } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        status: true,
        rerunRequestId: true,
        approvedAt: true,
        deniedAt: true,
        startedAt: true,
        completedAt: true,
        totalReferences: true,
        openAccessCount: true,
        pipelineLog: true,
        project: { select: { id: true, projectId: true } },
      },
    })) as LedgerRow[];

    const today = (d: Date | null): d is Date => d !== null && d.getTime() >= dayStart.getTime();
    const events: FeedEvent[] = [];
    for (const r of rows) {
      const code = r.project.projectId;
      const projectHref = `/admin/projects/${r.project.id}`;
      if (r.rerunRequestId && today(r.approvedAt)) {
        events.push({
          id: `research-approved:${r.id}`,
          kind: "research",
          at: r.approvedAt.toISOString(),
          title: `Research re-run approved: ${code}`,
          detail: null,
          href: "/admin/research-requests",
        });
      }
      if (today(r.deniedAt)) {
        events.push({
          id: `research-denied:${r.id}`,
          kind: "warning",
          at: r.deniedAt.toISOString(),
          title: `Research re-run declined: ${code}`,
          detail: null,
          href: "/admin/research-requests",
        });
      }
      if (today(r.startedAt)) {
        events.push({
          id: `research-started:${r.id}`,
          kind: "research",
          at: r.startedAt.toISOString(),
          title: `Research started: ${code}`,
          detail: r.rerunRequestId ? "OpenAlex pipeline · approved re-run" : "OpenAlex pipeline",
          href: projectHref,
        });
      }
      if (today(r.completedAt)) {
        if (r.status === "COMPLETE") {
          events.push({
            id: `research-finished:${r.id}`,
            kind: "research",
            at: r.completedAt.toISOString(),
            title: `Research finished: ${code} — ${plural(r.totalReferences ?? 0, "reference")}`,
            detail: r.openAccessCount !== null ? `${r.openAccessCount} open access` : null,
            href: projectHref,
          });
        } else if (r.status === "FAILED") {
          const replaced = replacedByRerun(r.pipelineLog);
          events.push({
            id: `research-failed:${r.id}`,
            kind: replaced ? "status" : "warning",
            at: r.completedAt.toISOString(),
            title: replaced ? `Research run replaced by a re-run: ${code}` : `Research needs review: ${code}`,
            detail: null,
            href: projectHref,
          });
        }
      }
    }
    return events;
  });
}
