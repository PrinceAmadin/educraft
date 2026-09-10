import type { ProjectStatus } from "@prisma/client";
import type { PipelineStatus } from "@/lib/status";

export interface ActiveProjectsStat {
  count: number;
  /** Projects created since midnight — the "+12 today" line. */
  newToday: number;
}

export interface RevenueStat {
  /** Confirmed inflow for the current calendar month, in naira. */
  amount: number;
  lastMonthAmount: number;
  /** null when last month was zero — there is no percentage against nothing. */
  deltaPercent: number | null;
}

export interface PayoutsStat {
  amount: number;
  workerAmount: number;
  ambassadorAmount: number;
  workerCount: number;
  ambassadorCount: number;
}

export interface AtRiskStat {
  /** IN_PROGRESS with an internal deadline inside the next 3 days. */
  count: number;
  /** Already past the internal deadline and not yet delivered. */
  overdueCount: number;
}

export interface DashboardStats {
  activeProjects: ActiveProjectsStat;
  revenueThisMonth: RevenueStat;
  pendingPayouts: PayoutsStat;
  atRisk: AtRiskStat;
}

export interface PipelineSegment {
  status: PipelineStatus;
  count: number;
  /** Of `count`, how many are inside 3 days of their internal deadline or past it. */
  atRisk: number;
}

export interface ActivityEntry {
  id: string;
  /** Human-facing project code, e.g. EC-00234. */
  projectCode: string;
  projectDbId: string;
  fromStatus: ProjectStatus;
  toStatus: ProjectStatus;
  actor: string | null;
  createdAt: string;
}

export interface ActionCounts {
  downpaymentsToVerify: number;
  balancesToVerify: number;
  awaitingAssignment: number;
  overdue: number;
  qaQueue: number;
  revisionEscalations: number;
}

export interface DashboardSummary {
  stats: DashboardStats;
  pipeline: PipelineSegment[];
  activity: ActivityEntry[];
  actions: ActionCounts;
  generatedAt: string;
}
