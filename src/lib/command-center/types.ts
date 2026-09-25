/**
 * Command Center payload types (Phase 5).
 *
 * Pure types shared by the aggregation endpoints under
 * /api/admin/command-center/* and the client components that render them.
 * Every date is an ISO string, money is whole naira (AI cost keeps 2 dp),
 * and every percentage is a 0–100 number unless the comment says otherwise.
 * Nothing here may import server code.
 */

export type CcTabKey = "today" | "health" | "growth" | "finance";

// ── Today ─────────────────────────────────────────────────────────

export type AlertSeverity = "critical" | "attention";

export type AlertKind =
  | "overdue"
  | "payouts"
  | "worker_flags"
  | "platinum_bonus"
  | "ops_reserve"
  | "unassigned"
  | "qa_waiting"
  | "corrections"
  | "activation"
  | "dormant_workers"
  | "messages"
  | "documents"
  | "verify_payments"
  | "research"
  | "applications"
  | "revision_cap";

export interface CcAlert {
  /** Stable, unique within the payload (e.g. "overdue:<projectDbId>"). */
  key: string;
  severity: AlertSeverity;
  kind: AlertKind;
  /** One line, sentence case, e.g. "EC-00312 overdue". */
  title: string;
  /** Second line, e.g. "Engineering FYP — 1 day past deadline". */
  detail: string | null;
  /** Small trailing context, e.g. "Worker: Chidi Okonkwo" or "COO action needed". */
  meta: string | null;
  /** The filtered page where the problem lives. */
  href: string;
  /** Link label, e.g. "Go to project". */
  hrefLabel: string;
  /** How many items this row stands for (a summary row such as "and 5 more overdue projects"); 1 when absent. */
  count?: number;
}

export type FeedKind =
  | "payment"
  | "approved"
  | "delivered"
  | "completed"
  | "submitted"
  | "status"
  | "overdue"
  | "warning"
  | "person"
  | "tier"
  | "payout"
  | "research"
  | "document";

export interface FeedEvent {
  /** Unique per source row, e.g. "log:<id>", "payment:<id>". */
  id: string;
  kind: FeedKind;
  /** ISO instant of the event. */
  at: string;
  title: string;
  detail: string | null;
  href: string | null;
}

export interface TodayNumbers {
  projectsCompleted: { today: number; yesterday: number };
  paymentsReceived: {
    amount: number;
    count: number;
    downpayments: number;
    balances: number;
    yesterdayAmount: number;
  };
  newReferrals: { today: number; yesterday: number; ambassadors: number };
  newConversions: { today: number; yesterday: number };
}

export interface TodayPayload {
  generatedAt: string;
  /** Start of today in WAT, as an ISO instant. */
  dayStart: string;
  /** "September 24, 2026" in WAT. */
  dayLabel: string;
  alerts: { critical: CcAlert[]; attention: CcAlert[] };
  feed: FeedEvent[];
  todayNumbers: TodayNumbers;
  /** Signals this branch cannot track yet (Phase 3/4 data), for a footnote. */
  pending: string[];
}

// ── Business health ───────────────────────────────────────────────

export type KpiUnit = "naira" | "count" | "percent";

export interface Kpi {
  value: number;
  /** The figure to compare with (see `previousLabel`), null when there is none. */
  previous: number | null;
  /** What `previous` is, for the delta line: "last month" (default) or "this time last month". */
  previousLabel?: string;
  /** Set when `value` means nothing yet (no revenue this month for a margin): the card shows "—" and this line. */
  emptyLabel?: string | null;
  /** Last 6 months, oldest first, ending with `value`. */
  sparkline: number[];
  unit: KpiUnit;
  href: string;
}

export interface HealthKpis {
  revenue: Kpi;
  activeProjects: Kpi;
  /** Percent; value may be 0 when revenue is 0. */
  grossMargin: Kpi;
  /** Percent of the annual revenue target (annualised current month). */
  goalProgress: Kpi;
}

export type RagStatus = "green" | "amber" | "red" | "neutral";

export type ScorecardDomain = "OPERATIONS" | "GROWTH" | "FINANCE" | "QUALITY";

export interface ScorecardRow {
  key: string;
  domain: ScorecardDomain;
  metric: string;
  /** Raw figure (percent 0–100, naira, count or ratio) or null when untracked. */
  actual: number | null;
  /** Pre-formatted for display, e.g. "91%", "₦285K", "1/34". */
  actualLabel: string;
  /** Pre-formatted target, e.g. "≥95%", "60–85%", "→ zero", "growing". */
  targetLabel: string;
  status: RagStatus;
  href: string;
  /** Optional explanation, e.g. "Not yet tracked — arrives with Phase 4". */
  note: string | null;
}

export interface RevenueTrendPoint {
  month: string;
  /** "Sep 26" */
  label: string;
  revenue: number;
  /** Gross margin percent for the month, null when revenue is 0. */
  margin: number | null;
}

export interface Throughput {
  allTime: { projects: number; workers: number; schools: number };
  thisYear: { projects: number; revenue: number; clients: number };
  thisMonth: { projects: number; revenue: number; clients: number };
}

export interface HealthPayload {
  generatedAt: string;
  month: string;
  /** "September 2026" */
  monthLabel: string;
  /** 1-based count of months since the first confirmed payment. */
  operatingMonth: number;
  kpis: HealthKpis;
  scorecard: ScorecardRow[];
  revenueTrend: RevenueTrendPoint[];
  throughput: Throughput;
}

// ── Growth engine ─────────────────────────────────────────────────

export type TierKey = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";

export interface TierPromotion {
  ambassadorId: string;
  name: string;
  from: TierKey;
  to: TierKey;
  at: string;
  href: string;
}

export interface SchoolStat {
  universityId: string;
  name: string;
  abbreviation: string;
  conversions: number;
  /** ISO date of the school's first conversion. */
  since: string | null;
}

export interface TierDistributionPoint {
  month: string;
  /** "Sep 26" */
  label: string;
  bronze: number;
  silver: number;
  gold: number;
  platinum: number;
}

export interface TopAmbassador {
  id: string;
  code: string;
  name: string;
  tier: TierKey;
  school: string | null;
  conversions: number;
  earned: number;
  href: string;
}

export interface ConversionTrendPoint {
  /** ISO instant of the Monday 00:00 WAT that starts the week. */
  weekStart: string;
  /** "22 Sep" */
  label: string;
  conversions: number;
  newAmbassadors: number;
}

export interface GrowthPayload {
  generatedAt: string;
  month: string;
  monthLabel: string;
  funnel: {
    referrals: number;
    /**
     * Where referrals are counted from: the Ambassador Platform's referral
     * rows ("referrals", after the phase-3 merge) or clients created with a
     * referrer ("orders", before it).
     */
    referralSource: "referrals" | "orders";
    conversions: number;
    /** Percent, null when there were no referrals. */
    conversionRate: number | null;
    projectsCreated: number;
    channel: { ambassadorDriven: number; direct: number };
  };
  ambassadorStats: {
    /** Ambassadors in the network: not suspended or terminated. */
    total: number;
    /** Account status Active. */
    active: number;
    /** Converted a client in the last 30 days (the activation rate's numerator). */
    activeThisMonth: number;
    /** Percent, null when there are no active ambassadors. */
    activationRate: number | null;
    /** Percent target from settings. */
    activationTarget: number;
    /** Percent watch level from settings (below it the rate is off track). */
    activationAmber?: number;
    newThisMonth: number;
    tierPromotions: TierPromotion[];
  };
  schoolPenetration: {
    count: number;
    topSchool: SchoolStat | null;
    newestSchool: SchoolStat | null;
  };
  tierDistribution: {
    /**
     * How the tiers were rebuilt: from the Ambassador Platform's converted
     * referrals, the count that sets the tier on each record ("referrals"),
     * or before the phase-3 merge from paying clients on main's orders
     * ("conversions"), which may differ from the hand-set stored tier.
     */
    basis: "conversions" | "referrals";
    points: TierDistributionPoint[];
  };
  topAmbassadors: TopAmbassador[];
  conversionTrend: ConversionTrendPoint[];
  links: { leaderboard: string; platform: string };
  pending: string[];
}

// ── Financial pulse ───────────────────────────────────────────────

export type BucketKey =
  | "OPERATIONS_RESERVE"
  | "GROWTH_FUND"
  | "REINVESTMENT_FUND"
  | "FOUNDER_DISTRIBUTION";

export type BucketHealthLevel = "healthy" | "monitor" | "attention";

export interface BucketPulseCard {
  bucket: BucketKey;
  label: string;
  purpose: string;
  balance: number;
  health: { level: BucketHealthLevel; percent: number; target: number };
  /** Inflow minus outflow logged this month (signed). */
  netThisMonth: number;
  /** Same for last month (signed). */
  netLastMonth: number;
  href: string;
}

export type PayoutLineStatus = "PENDING" | "PAID" | "NONE";

export interface PayoutGroupStatus {
  /** Distinct recipients with a record this month. */
  recipients: number;
  pending: number;
  paid: number;
  status: PayoutLineStatus;
}

export interface ExecPayoutStatus extends PayoutGroupStatus {
  name: string;
  /** Performance bonuses for the month, already included in `pending` / `paid`. */
  bonus?: { pending: number; paid: number };
}

export type FounderDrawStatus = "NONE" | "PENDING" | "PARTIAL" | "DISTRIBUTED";

export interface AiBalance {
  configured: boolean;
  remaining: number | null;
  /** 0–100, null when not configured. */
  percentRemaining: number | null;
  level: "ok" | "low" | "critical" | null;
}

export interface FinancePayload {
  generatedAt: string;
  month: string;
  monthLabel: string;
  revenuePosition: {
    confirmed: number;
    refunds: number;
    workerPayouts: number;
    ambassadorComm: number;
    hogComm: number;
    cooComm: number;
    retained: number;
    /**
     * Retained minus (confirmed − the four legs): what the Bucket Manager logged
     * this month for money that came in earlier (an ambassador allocated after
     * payment, a refund true-up). Zero in a month with no such change; shown as
     * its own line so the ledger adds up.
     */
    trueUps?: number;
    /** Percent, null when confirmed is 0. */
    grossMargin: number | null;
    /** Amount-weighted share of this month's confirmed inflows that were ambassador-driven; percent or null. */
    ambassadorDrivenShare: number | null;
    outstanding: { amount: number; projects: number; clients: number };
    approvedBalancePending: number;
  };
  buckets: BucketPulseCard[];
  payoutStatus: {
    workers: PayoutGroupStatus;
    ambassadors: PayoutGroupStatus;
    hog: ExecPayoutStatus;
    coo: ExecPayoutStatus;
    totalPending: number;
    submission: { submittedAt: string } | null;
    founderDraws: {
      drawEach: number;
      total: number;
      distributed: number;
      outstanding: number;
      funded: boolean;
      tierMin: number;
      status: FounderDrawStatus;
    };
  };
  aiUsage: {
    totalTokens: number;
    /** Naira, 2 dp. */
    totalCost: number;
    calls: number;
    projects: number;
    /** Naira per project, null when no project was billed this month. */
    avgCostPerProject: number | null;
    targetMin: number;
    targetMax: number;
    balance: AiBalance;
  };
  links: { finance: string; aiUsage: string };
}

// ── Settings ──────────────────────────────────────────────────────

export interface SettingsPayload {
  /** Effective values (row value or default), keyed by the cc.* key. */
  thresholds: Record<string, string>;
  /** Code defaults for the same keys. */
  defaults: Record<string, string>;
  /** Keys whose value came from a Setting row rather than the default. */
  overridden: string[];
}

// ── Client-side envelope ──────────────────────────────────────────

export interface CcTabPayloads {
  today: TodayPayload;
  health: HealthPayload;
  growth: GrowthPayload;
  finance: FinancePayload;
}
