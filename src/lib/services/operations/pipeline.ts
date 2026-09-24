import { Prisma, type ProjectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { MAX_REVISIONS } from "@/lib/pipeline";
import { MAX_CORRECTION_ROUNDS, roundsSoFar } from "@/lib/operations/corrections";
import {
  BOARD_STATUSES,
  DEFAULT_EXPECTED_HOURS,
  expectationSettingKey,
  PIPELINE_STAGES,
  resolveExpectedHours,
  statusAge,
  type AgeTone,
  type ExpectedHours,
  type StageKey,
} from "@/lib/operations/pipeline-stages";
import { deadlineInfo } from "@/lib/utils";

/**
 * The COO's pipeline: counts per stage with what needs a look, and the
 * Action required list. Both read the same board (every open project with
 * when it entered its current status) so they always agree.
 */

// ── Expected time per status (Settings) ─────────────────────

export async function getExpectedHours(): Promise<ExpectedHours> {
  const keys = (Object.keys(DEFAULT_EXPECTED_HOURS) as ProjectStatus[]).map(expectationSettingKey);
  const rows = await getSettings(keys);
  return resolveExpectedHours(rows);
}

/** Null (or a blank) puts a status back on its default. */
export async function saveExpectedHours(hours: Partial<Record<ProjectStatus, number | null>>): Promise<ExpectedHours> {
  const writes: Prisma.PrismaPromise<unknown>[] = [];
  for (const [status, value] of Object.entries(hours) as [ProjectStatus, number | null | undefined][]) {
    if (value === undefined) continue;
    const key = expectationSettingKey(status);
    if (value == null) writes.push(db.setting.deleteMany({ where: { key } }));
    else writes.push(db.setting.upsert({ where: { key }, update: { value: String(value) }, create: { key, value: String(value) } }));
  }
  if (writes.length) await db.$transaction(writes);
  return getExpectedHours();
}

// ── The board ───────────────────────────────────────────────

const boardSelect = {
  id: true,
  projectId: true,
  projectTitle: true,
  status: true,
  atRisk: true,
  atRiskNote: true,
  revisionCount: true,
  supervisorCorrectionCount: true,
  internalDeadline: true,
  clientDeadline: true,
  downpaymentStatus: true,
  balanceStatus: true,
  workerId: true,
  createdAt: true,
  client: { select: { fullName: true, department: true } },
  service: { select: { serviceName: true } },
  worker: { select: { fullName: true } },
  statusLog: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
  qaReview: { select: { reviewerId: true, reviewerName: true, startedAt: true } },
  correctionRounds: { orderBy: { roundNumber: "desc" }, take: 1, select: { roundNumber: true, deadline: true, status: true } },
  _count: { select: { correctionRounds: true } },
} satisfies Prisma.ProjectSelect;

type BoardRow = Prisma.ProjectGetPayload<{ select: typeof boardSelect }>;

export interface BoardProject extends BoardRow {
  /** When the project entered its current status (its creation when there is no log yet). */
  since: Date;
}

export async function loadBoard(): Promise<BoardProject[]> {
  const rows = await db.project.findMany({
    where: { status: { in: [...BOARD_STATUSES] } },
    select: boardSelect,
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ ...r, since: r.statusLog[0]?.createdAt ?? r.createdAt }));
}

/** Statuses where a passed deadline means the work is late (not merely paid late or delivered). */
const DEADLINE_STATUSES: readonly ProjectStatus[] = [
  "ASSIGNED",
  "IN_PROGRESS",
  "AWAITING_CLIENT_INPUT",
  "SUBMITTED",
  "IN_QA_REVIEW",
  "REVISION_NEEDED",
  "APPROVED",
  "BALANCE_VERIFIED",
];

const AT_RISK_WINDOW_DAYS = 3;
const QA_OVERDUE_HOURS = 24;
const DELIVERED_SETTLE_HOURS = 168;

// ── Pipeline summary ────────────────────────────────────────

export interface StageAlert {
  label: string;
  count: number;
  tone: AgeTone;
}

export interface PipelineStageSummary {
  key: StageKey;
  label: string;
  short: string;
  count: number;
  alerts: StageAlert[];
  tone: AgeTone;
}

export interface PipelineSummary {
  stages: PipelineStageSummary[];
  total: number;
  generatedAt: string;
}

function worstTone(alerts: StageAlert[]): AgeTone {
  if (alerts.some((a) => a.count > 0 && a.tone === "red")) return "red";
  if (alerts.some((a) => a.count > 0 && a.tone === "amber")) return "amber";
  return "normal";
}

export function summarizeBoard(board: readonly BoardProject[], expected: ExpectedHours, now: Date = new Date()): PipelineSummary {
  const stages: PipelineStageSummary[] = PIPELINE_STAGES.map((stage) => {
    const rows = board.filter((p) => stage.statuses.includes(p.status));
    const late = (p: BoardProject) => statusAge(p.since, p.status, expected, now).tone !== "normal";
    const alerts: StageAlert[] = [];
    switch (stage.key) {
      case "new":
        alerts.push({ label: "waiting", count: rows.filter((p) => p.status === "DOWNPAYMENT_VERIFIED" && late(p)).length, tone: "amber" });
        break;
      case "confirmed":
        alerts.push({ label: "unassigned", count: rows.filter((p) => !p.workerId && late(p)).length, tone: "amber" });
        break;
      case "assigned":
        alerts.push({ label: "not started", count: rows.filter(late).length, tone: "amber" });
        break;
      case "in_progress": {
        const overdue = rows.filter((p) => deadlineInfo(p.internalDeadline ?? p.clientDeadline, now).urgency === "overdue").length;
        const atRisk = rows.filter((p) => {
          const info = deadlineInfo(p.internalDeadline ?? p.clientDeadline, now);
          return p.atRisk || (info.daysLeft != null && info.daysLeft >= 0 && info.daysLeft <= AT_RISK_WINDOW_DAYS);
        }).length;
        alerts.push({ label: "overdue", count: overdue, tone: "red" }, { label: "at risk", count: atRisk, tone: "amber" });
        break;
      }
      case "qa":
        alerts.push({
          label: "over 24h",
          count: rows.filter((p) => statusAge(p.since, p.status, expected, now).hours >= QA_OVERDUE_HOURS).length,
          tone: "amber",
        });
        break;
      case "approved":
        alerts.push({ label: "waiting", count: rows.filter(late).length, tone: "amber" });
        break;
      case "delivered":
        alerts.push({
          label: "past 7 days",
          count: rows.filter((p) => statusAge(p.since, p.status, expected, now).hours >= DELIVERED_SETTLE_HOURS).length,
          tone: "amber",
        });
        break;
      case "corrections":
        alerts.push({
          label: "round 3",
          count: rows.filter((p) => roundsSoFar(p._count.correctionRounds, p.supervisorCorrectionCount) >= MAX_CORRECTION_ROUNDS).length,
          tone: "red",
        });
        break;
    }
    return { key: stage.key, label: stage.label, short: stage.short, count: rows.length, alerts, tone: worstTone(alerts) };
  });
  return { stages, total: stages.reduce((s, x) => s + x.count, 0), generatedAt: now.toISOString() };
}

export async function getPipelineSummary(now: Date = new Date()): Promise<PipelineSummary> {
  const [board, expected] = await Promise.all([loadBoard(), getExpectedHours()]);
  return summarizeBoard(board, expected, now);
}

// ── Action required ─────────────────────────────────────────

export type ActionSeverity = "urgent" | "attention" | "routine";

export interface ActionItem {
  key: string;
  severity: ActionSeverity;
  projectDbId: string;
  projectCode: string;
  clientName: string;
  serviceName: string;
  workerName: string | null;
  /** The headline: "OVERDUE — deadline was 2 days ago". */
  reason: string;
  detail: string | null;
  action: { label: string; href: string };
  /** Hours the condition has held, for sorting oldest-first inside a severity. */
  ageHours: number;
}

export interface ActionRequired {
  items: ActionItem[];
  total: number;
  counts: Record<ActionSeverity, number>;
}

const SEVERITY_RANK: Record<ActionSeverity, number> = { urgent: 0, attention: 1, routine: 2 };

function daysAgo(hours: number): string {
  const d = Math.floor(hours / 24);
  if (d <= 0) return "today";
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export function actionsForBoard(board: readonly BoardProject[], expected: ExpectedHours, now: Date = new Date()): ActionRequired {
  const items: ActionItem[] = [];

  for (const p of board) {
    const age = statusAge(p.since, p.status, expected, now);
    const deadline = p.internalDeadline ?? p.clientDeadline;
    const dl = deadlineInfo(deadline, now);
    const href = `/admin/projects/${p.projectId}`;
    const base = {
      projectDbId: p.id,
      projectCode: p.projectId,
      clientName: p.client.fullName,
      serviceName: p.service.serviceName,
      workerName: p.worker?.fullName ?? null,
    };
    const push = (key: string, severity: ActionSeverity, reason: string, action: ActionItem["action"], detail: string | null = null, ageHours = age.hours) =>
      items.push({ key: `${p.id}:${key}`, severity, ...base, reason, detail, action, ageHours });

    if (p.atRisk) push("at-risk", "urgent", "FLAGGED AT RISK", { label: "View", href }, p.atRiskNote);

    if (dl.urgency === "overdue" && DEADLINE_STATUSES.includes(p.status)) {
      const late = Math.abs(dl.daysLeft ?? 0);
      push("overdue", "urgent", `OVERDUE — deadline was ${late === 0 ? "today" : late === 1 ? "yesterday" : `${late} days ago`}`, { label: "View", href }, null, late * 24);
    }

    if (p.revisionCount >= MAX_REVISIONS && ["REVISION_NEEDED", "SUBMITTED", "IN_QA_REVIEW"].includes(p.status)) {
      push("revision-cap", "urgent", `REVISION CAP — ${p.revisionCount} revisions, founder review`, { label: "View", href });
    }

    switch (p.status) {
      case "NEW":
        if (p.downpaymentStatus === "Paid") {
          push("marked-paid", "routine", "DOWNPAYMENT MARKED PAID — awaiting finance verification", { label: "Financials", href: `${href}?tab=financials` });
        }
        break;
      case "DOWNPAYMENT_VERIFIED":
        push("confirm", age.tone === "normal" ? "routine" : "attention", `NEW REQUIREMENTS — client paid ${daysAgo(age.hours)}`, { label: "Confirm", href });
        break;
      case "REQUIREMENTS_CONFIRMED":
        if (!p.workerId) {
          push("unassigned", age.hours >= 24 ? "attention" : "routine", `UNASSIGNED — confirmed ${daysAgo(age.hours)}`, { label: "Assign", href: `${href}/assign` });
        }
        break;
      case "ASSIGNED":
        if (age.tone !== "normal") {
          push("not-started", "attention", `NOT STARTED — assigned ${daysAgo(age.hours)}, worker has not accepted`, { label: "View", href });
        }
        break;
      case "IN_PROGRESS":
      case "REVISION_NEEDED":
        if (dl.urgency !== "overdue" && dl.daysLeft != null && dl.daysLeft <= AT_RISK_WINDOW_DAYS) {
          push("deadline", "attention", `APPROACHING DEADLINE — ${dl.label.toLowerCase()}`, { label: "View", href }, null, (AT_RISK_WINDOW_DAYS - dl.daysLeft) * 24);
        }
        break;
      case "AWAITING_CLIENT_INPUT":
        if (age.hours >= 72) {
          push("waiting-client", "attention", `WAITING ON CLIENT — since ${daysAgo(age.hours)}`, { label: "Message", href: `${href}?tab=messages` });
        }
        break;
      case "SUBMITTED":
      case "IN_QA_REVIEW":
        if (age.hours >= QA_OVERDUE_HOURS) {
          push(
            "qa-late",
            "attention",
            `IN QA >24 HOURS — ${p.qaReview?.reviewerName ? "reviewer idle" : "no reviewer"}`,
            { label: "Review now", href: `/admin/qa/${p.projectId}` }
          );
        } else if (p.status === "SUBMITTED" && !p.qaReview?.reviewerId) {
          push("qa-unassigned", "routine", "SUBMITTED — needs a reviewer", { label: "Assign reviewer", href: `/admin/qa` });
        }
        break;
      case "APPROVED":
        if (age.tone !== "normal" && p.balanceStatus !== "Verified") {
          push("balance", "routine", `AWAITING BALANCE — approved ${daysAgo(age.hours)}`, { label: "Payments", href: `${href}?tab=financials` });
        }
        break;
      case "BALANCE_VERIFIED":
        if (age.tone !== "normal") {
          push("deliver", "attention", "READY TO DELIVER — release the complete document", { label: "Documents", href: `${href}?tab=documents` });
        }
        break;
      case "DELIVERED":
        if (age.hours >= DELIVERED_SETTLE_HOURS) {
          push("complete", "routine", `DELIVERED ${Math.floor(age.hours / 24)} DAYS AGO — mark completed`, { label: "View", href });
        }
        break;
      case "SUPERVISOR_CORRECTIONS": {
        const latest = p.correctionRounds[0];
        const round = latest?.roundNumber ?? roundsSoFar(p._count.correctionRounds, p.supervisorCorrectionCount) ?? 1;
        const roundOverdue = latest?.deadline != null && latest.deadline < now;
        push(
          "corrections",
          round >= MAX_CORRECTION_ROUNDS || roundOverdue ? "urgent" : "attention",
          `SUPERVISOR CORRECTIONS — round ${Math.max(round, 1)} of ${MAX_CORRECTION_ROUNDS}`,
          { label: "View", href },
          roundOverdue ? "This round is past its deadline" : null
        );
        break;
      }
      default:
        break;
    }
  }

  items.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.ageHours - a.ageHours);

  // One line per project: its most pressing reason.
  const seen = new Set<string>();
  const deduped = items.filter((i) => {
    if (seen.has(i.projectDbId)) return false;
    seen.add(i.projectDbId);
    return true;
  });

  const counts: Record<ActionSeverity, number> = { urgent: 0, attention: 0, routine: 0 };
  for (const i of deduped) counts[i.severity]++;
  return { items: deduped, total: deduped.length, counts };
}

export async function getActionRequired(now: Date = new Date()): Promise<ActionRequired> {
  const [board, expected] = await Promise.all([loadBoard(), getExpectedHours()]);
  return actionsForBoard(board, expected, now);
}

/** Both panels for the projects page, from one read of the board. */
export async function getOperationsOverview(now: Date = new Date()): Promise<{ summary: PipelineSummary; actions: ActionRequired; expected: ExpectedHours }> {
  const [board, expected] = await Promise.all([loadBoard(), getExpectedHours()]);
  return { summary: summarizeBoard(board, expected, now), actions: actionsForBoard(board, expected, now), expected };
}
