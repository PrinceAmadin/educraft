import type { AmbassadorTier, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { activityStatus, calculateTier, type ActivityStatus } from "@/lib/ambassadors/tier-utils";
import { PLATINUM_QUARTERLY_BONUS_PER_CLIENT, QUARTERLY_CHALLENGE } from "@/lib/finance/commission-config";
import { getPayoutMonth, type AmbassadorPayoutGroup } from "@/lib/services/finance/payouts-engine";
import { currentMonthKey, monthLabel, quarterOf } from "@/lib/services/finance/surplus";
import { formatNaira } from "@/lib/utils";
import type { CommissionHistoryQuery } from "@/lib/validations/ambassador-platform";

/**
 * Commissions (Phase 3 Section 4): the HOG's view of what ambassadors earn.
 * Everything money-related reads `PayoutRecord` — the Phase 2 ledger the
 * finance payout queue pays from — so this page and the CFO's screen never
 * disagree. Quarterly bonuses become PayoutRecords too (leg BONUS, no
 * project, one `bonusKey` per bonus), paid through the same queue.
 */

export const CHALLENGE_TARGET = QUARTERLY_CHALLENGE.target;
export const CHALLENGE_BONUS = QUARTERLY_CHALLENGE.bonus;
const DAY = 86_400_000;

// ── Quarter keys: the platform writes "Q3-2026"; finance's quarterOf() says "2026-Q3" ──

export interface Quarter {
  /** "Q3-2026" */
  key: string;
  label: string;
  start: Date;
  /** Exclusive: the first instant of the next quarter. */
  end: Date;
  /** The month a bonus earned in this quarter is paid in (the first month after it). */
  payoutMonth: string;
  months: string[];
}

export function quarterFromKey(key: string): Quarter {
  const m = /^Q([1-4])-(\d{4})$/.exec(key);
  if (!m) throw new CommissionsError("Use a quarter like Q3-2026");
  const q = Number(m[1]);
  const y = Number(m[2]);
  const info = quarterOf(`${y}-${String((q - 1) * 3 + 1).padStart(2, "0")}`);
  const start = new Date(Date.UTC(y, (q - 1) * 3, 1));
  const end = new Date(Date.UTC(y, q * 3, 1));
  return { key, label: info.label, start, end, payoutMonth: `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}`, months: info.months };
}

export function currentQuarterKey(now: Date = new Date()): string {
  const q = Math.floor(now.getUTCMonth() / 3) + 1;
  return `Q${q}-${now.getUTCFullYear()}`;
}

export function previousQuarterKey(key: string): string {
  const { start } = quarterFromKey(key);
  const prev = new Date(start.getTime() - DAY);
  return currentQuarterKey(prev);
}

export class CommissionsError extends Error {}

// ── Sub-tab 1: current month ─────────────────────────────────────────────

export interface CommissionRow {
  id: string;
  code: string;
  name: string;
  tier: AmbassadorTier;
  school: string | null;
  activity: ActivityStatus;
  personal: number;
  personalCount: number;
  override: number;
  overrideCount: number;
  bonus: number;
  total: number;
  paid: number;
  unpaid: number;
  status: AmbassadorPayoutGroup["status"];
  paidAt: string | null;
}

export interface CommissionMonth {
  month: string;
  label: string;
  rows: CommissionRow[];
  totals: { total: number; personal: number; overrides: number; bonuses: number; paid: number; unpaid: number; recipients: number };
  whatsapp: string;
}

export async function getCommissionMonth(month: string = currentMonthKey(), now: Date = new Date()): Promise<CommissionMonth> {
  const payout = await getPayoutMonth(month);
  const ids = payout.ambassadors.map((g) => g.recipientId);
  const ambassadors = ids.length
    ? await db.ambassador.findMany({ where: { id: { in: ids } }, select: { id: true, lastConversionAt: true, lastReferralAt: true, createdAt: true, lifetimeConversions: true, university: { select: { abbreviation: true } } } })
    : [];
  const rows: CommissionRow[] = payout.ambassadors.map((g) => {
    const a = ambassadors.find((x) => x.id === g.recipientId);
    const bonus = Math.round(g.lines.filter((l) => l.leg === "BONUS").reduce((s, l) => s + l.amount, 0));
    return {
      id: g.recipientId,
      code: g.code,
      name: g.name,
      tier: g.tier as AmbassadorTier,
      school: a?.university?.abbreviation ?? null,
      activity: a ? activityStatus(a, now) : "INACTIVE",
      personal: g.personal.amount,
      personalCount: g.personal.count,
      override: g.overrides.amount,
      overrideCount: g.overrides.count,
      bonus,
      total: g.total,
      paid: g.paid,
      unpaid: g.unpaid,
      status: g.status,
      paidAt: g.paidAt,
    };
  });
  const totals = {
    total: rows.reduce((s, r) => s + r.total, 0),
    personal: rows.reduce((s, r) => s + r.personal, 0),
    overrides: rows.reduce((s, r) => s + r.override, 0),
    bonuses: rows.reduce((s, r) => s + r.bonus, 0),
    paid: rows.reduce((s, r) => s + r.paid, 0),
    unpaid: rows.reduce((s, r) => s + r.unpaid, 0),
    recipients: rows.length,
  };
  return { month, label: monthLabel(month), rows, totals, whatsapp: whatsappEarningsUpdate(month, rows) };
}

/** The "Ambassador Earnings Update" the HOG pastes into the community. Plain text, no emoji. */
export function whatsappEarningsUpdate(month: string, rows: CommissionRow[], processBy?: string): string {
  const label = monthLabel(month);
  const [name] = label.split(" ");
  const top = rows
    .slice()
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);
  const lines = [
    `${name.toUpperCase()} EARNINGS UPDATE`,
    "",
    "Dear Ambassadors,",
    "",
    `Your ${name} commissions have been calculated!`,
    "",
  ];
  if (top.length) {
    lines.push("Top earners this month:");
    top.forEach((r, i) => lines.push(`${i + 1}. ${r.name} — ${formatNaira(r.total)}`));
    lines.push("");
  } else {
    lines.push("No commissions this month yet — every confirmed referral counts toward next month.", "");
  }
  lines.push(`All commissions will be processed by ${processBy ?? "the end of the first week of next month"}.`);
  const next = monthLabel(nextMonthKey(month)).split(" ")[0];
  lines.push(`Keep referring! ${next} starts fresh.`);
  return lines.join("\n");
}

function nextMonthKey(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ── Sub-tab 2: history ───────────────────────────────────────────────────

export const HISTORY_PAGE_SIZE = 50;

export interface HistoryRow {
  id: string;
  month: string;
  monthLabel: string;
  ambassadorId: string;
  name: string;
  code: string;
  tier: AmbassadorTier;
  leg: string;
  projectCode: string | null;
  clientName: string | null;
  basis: string;
  amount: number;
  status: string;
  paidAt: string | null;
}

export interface HistoryResult {
  rows: HistoryRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  sums: { owed: number; paid: number };
}

export async function getCommissionHistory(q: CommissionHistoryQuery): Promise<HistoryResult> {
  const where: Prisma.PayoutRecordWhereInput = {
    recipientType: "AMBASSADOR",
    status: { not: "CANCELLED" },
    ...(q.month ? { month: q.month } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.q ? { recipientName: { contains: q.q, mode: "insensitive" } } : {}),
  };
  const records = await db.payoutRecord.findMany({
    where,
    orderBy: [{ month: "desc" }, { createdAt: "desc" }],
    select: { id: true, month: true, recipientId: true, recipientName: true, leg: true, basis: true, amount: true, status: true, paidAt: true, project: { select: { projectId: true, client: { select: { fullName: true } } } } },
  });
  const ids = [...new Set(records.map((r) => r.recipientId))];
  const ambassadors = ids.length ? await db.ambassador.findMany({ where: { id: { in: ids } }, select: { id: true, ambassadorId: true, tier: true } }) : [];
  const tierOf = new Map(ambassadors.map((a) => [a.id, a.tier]));
  const codeOf = new Map(ambassadors.map((a) => [a.id, a.ambassadorId]));
  const filtered = q.tier ? records.filter((r) => tierOf.get(r.recipientId) === q.tier) : records;
  const page = Math.max(1, q.page ?? 1);
  const start = (page - 1) * HISTORY_PAGE_SIZE;
  return {
    rows: filtered.slice(start, start + HISTORY_PAGE_SIZE).map((r) => ({
      id: r.id,
      month: r.month,
      monthLabel: monthLabel(r.month),
      ambassadorId: r.recipientId,
      name: r.recipientName,
      code: codeOf.get(r.recipientId) ?? "—",
      tier: tierOf.get(r.recipientId) ?? "BRONZE",
      leg: r.leg,
      projectCode: r.project?.projectId ?? null,
      clientName: r.project?.client.fullName ?? null,
      basis: r.basis,
      amount: r.amount,
      status: r.status,
      paidAt: r.paidAt?.toISOString() ?? null,
    })),
    total: filtered.length,
    page,
    pageCount: Math.max(1, Math.ceil(filtered.length / HISTORY_PAGE_SIZE)),
    pageSize: HISTORY_PAGE_SIZE,
    sums: { owed: Math.round(filtered.reduce((s, r) => s + r.amount, 0)), paid: Math.round(filtered.filter((r) => r.status === "PAID").reduce((s, r) => s + r.amount, 0)) },
  };
}

// ── Sub-tab 3: quarterly bonus tracker ───────────────────────────────────

export type BonusState = "IN_PROGRESS" | "LOCKED_IN" | "PENDING_PAYOUT" | "PAID" | "NOT_EARNED";

export interface TrackerRow {
  id: string;
  code: string;
  name: string;
  tier: AmbassadorTier;
  quarterConversions: number;
  /** Platinum only: PLATINUM_QUARTERLY_BONUS_PER_CLIENT per client this quarter. */
  platinum: { eligible: boolean; earned: number; state: BonusState; toPlatinum: number | null };
  /** `endDate` is the exclusive end (the first instant after the window); `lastDay` is the last day that counts, for display. */
  challenge: { count: number; target: number; completed: boolean; endDate: string; lastDay: string; extensionGranted: boolean; extensionEndDate: string | null; bonus: number; state: BonusState; canExtend: boolean };
}

export interface QuarterTracker {
  quarter: Quarter;
  ended: boolean;
  canProcess: boolean;
  rows: TrackerRow[];
  totals: { platinumEarned: number; challengeEarned: number; ambassadorsInChallenge: number; processed: number };
}

const CLOSED = ["Suspended", "Terminated"];

function bonusState(earned: number, ended: boolean, record: { status: string } | undefined): BonusState {
  if (earned <= 0) return "NOT_EARNED";
  if (record) return record.status === "PAID" ? "PAID" : "PENDING_PAYOUT";
  return ended ? "LOCKED_IN" : "IN_PROGRESS";
}

export async function getQuarterTracker(key: string = currentQuarterKey(), now: Date = new Date()): Promise<QuarterTracker> {
  const quarter = quarterFromKey(key);
  const ended = now.getTime() >= quarter.end.getTime();
  const [ambassadors, conversions, challenges, records] = await Promise.all([
    db.ambassador.findMany({ where: { status: { notIn: CLOSED } }, select: { id: true, ambassadorId: true, fullName: true, tier: true, lifetimeConversions: true } }),
    db.ambassadorReferral.groupBy({ by: ["ambassadorId"], where: { status: "CONVERTED", convertedAt: { gte: quarter.start, lt: quarter.end } }, _count: { _all: true } }),
    db.ambassadorQuarterlyChallenge.findMany({ where: { quarter: key } }),
    db.payoutRecord.findMany({ where: { leg: "BONUS", OR: [{ bonusKey: { startsWith: `platinum:${key}:` } }, { bonusKey: { startsWith: `challenge:${key}:` } }], status: { not: "CANCELLED" } }, select: { bonusKey: true, status: true, amount: true } }),
  ]);
  const convOf = new Map(conversions.map((c) => [c.ambassadorId, c._count._all]));
  const recordOf = new Map(records.map((r) => [r.bonusKey!, r]));

  // Extension conversions: a one-week extension lets conversions in the extra week count for the challenge.
  const extended = challenges.filter((c) => c.extensionGranted && c.extensionEndDate);
  const extraConv = new Map<string, number>();
  if (extended.length) {
    const latest = new Date(Math.max(...extended.map((c) => c.extensionEndDate!.getTime())));
    const extra = await db.ambassadorReferral.findMany({ where: { ambassadorId: { in: extended.map((c) => c.ambassadorId) }, status: "CONVERTED", convertedAt: { gte: quarter.end, lt: latest } }, select: { ambassadorId: true, convertedAt: true } });
    for (const c of extended) extraConv.set(c.ambassadorId, extra.filter((x) => x.ambassadorId === c.ambassadorId && x.convertedAt! < c.extensionEndDate!).length);
  }

  const rows: TrackerRow[] = ambassadors
    .map((a) => {
      const inQuarter = convOf.get(a.id) ?? 0;
      const ch = challenges.find((c) => c.ambassadorId === a.id);
      const challengeCount = inQuarter + (extraConv.get(a.id) ?? 0);
      const target = ch?.targetCount ?? CHALLENGE_TARGET;
      const completed = ch?.completed || challengeCount >= target;
      const challengeEnd = ch?.extensionGranted && ch.extensionEndDate ? ch.extensionEndDate : quarter.end;
      const challengeEnded = now.getTime() >= challengeEnd.getTime();
      const isPlatinum = calculateTier(a.lifetimeConversions) === "PLATINUM";
      const platinumEarned = isPlatinum ? inQuarter * PLATINUM_QUARTERLY_BONUS_PER_CLIENT : 0;
      const challengeBonus = completed ? (ch?.bonusAmount ?? CHALLENGE_BONUS) : 0;
      return {
        id: a.id,
        code: a.ambassadorId,
        name: a.fullName,
        tier: a.tier,
        quarterConversions: inQuarter,
        platinum: { eligible: isPlatinum, earned: platinumEarned, state: isPlatinum ? bonusState(platinumEarned, ended, recordOf.get(`platinum:${key}:${a.id}`)) : "NOT_EARNED", toPlatinum: isPlatinum ? null : 31 - a.lifetimeConversions },
        challenge: {
          count: challengeCount,
          target,
          completed,
          endDate: challengeEnd.toISOString(),
          // Midday of the last day, so it reads the same date in UTC (Vercel) and WAT (a Lagos laptop).
          lastDay: new Date(challengeEnd.getTime() - 12 * 3_600_000).toISOString(),
          extensionGranted: ch?.extensionGranted ?? false,
          extensionEndDate: ch?.extensionEndDate?.toISOString() ?? null,
          bonus: challengeBonus,
          state: completed ? bonusState(challengeBonus, challengeEnded || completed, recordOf.get(`challenge:${key}:${a.id}`)) : challengeEnded ? "NOT_EARNED" : "IN_PROGRESS",
          canExtend: !ch?.extensionGranted && !completed && !ended && challengeCount > 0,
        },
      };
    })
    .filter((r) => r.quarterConversions > 0 || r.platinum.eligible || r.challenge.count > 0)
    .sort((a, b) => b.quarterConversions - a.quarterConversions || a.name.localeCompare(b.name));

  return {
    quarter,
    ended,
    canProcess: ended && rows.some((r) => (r.platinum.earned > 0 && r.platinum.state === "LOCKED_IN") || (r.challenge.bonus > 0 && r.challenge.state === "LOCKED_IN")),
    rows,
    totals: {
      platinumEarned: rows.reduce((s, r) => s + r.platinum.earned, 0),
      challengeEarned: rows.reduce((s, r) => s + r.challenge.bonus, 0),
      ambassadorsInChallenge: rows.filter((r) => r.challenge.count > 0).length,
      processed: records.length,
    },
  };
}

/**
 * "Process Qn bonuses" — once the quarter has ended, every locked-in bonus
 * becomes a PENDING PayoutRecord (leg BONUS, month = the first month after
 * the quarter) for the finance payout queue to pay. `bonusKey` is unique,
 * so running it twice creates nothing new.
 */
export async function processQuarterBonuses(key: string, byUserId: string, now: Date = new Date()): Promise<{ created: number; skipped: number; amount: number }> {
  const tracker = await getQuarterTracker(key, now);
  if (!tracker.ended) throw new CommissionsError(`${tracker.quarter.label} has not ended yet — bonuses are processed from ${tracker.quarter.end.toISOString().slice(0, 10)}`);
  let created = 0;
  let skipped = 0;
  let amount = 0;
  const month = tracker.quarter.payoutMonth;
  for (const r of tracker.rows) {
    const wanted: { bonusKey: string; amount: number; basis: string }[] = [];
    if (r.platinum.earned > 0) wanted.push({ bonusKey: `platinum:${key}:${r.id}`, amount: r.platinum.earned, basis: `Platinum quarterly bonus ${tracker.quarter.label}: ${r.quarterConversions} client${r.quarterConversions === 1 ? "" : "s"} × ${formatNaira(PLATINUM_QUARTERLY_BONUS_PER_CLIENT)}` });
    if (r.challenge.bonus > 0) wanted.push({ bonusKey: `challenge:${key}:${r.id}`, amount: r.challenge.bonus, basis: `Quarterly challenge ${tracker.quarter.label}: ${r.challenge.count} clients (target ${r.challenge.target})` });
    for (const w of wanted) {
      const existing = await db.payoutRecord.findUnique({ where: { bonusKey: w.bonusKey }, select: { id: true } });
      if (existing) {
        skipped += 1;
        continue;
      }
      await db.$transaction(async (tx) => {
        await tx.payoutRecord.create({ data: { month, leg: "BONUS", recipientType: "AMBASSADOR", recipientId: r.id, recipientName: r.name, bonusKey: w.bonusKey, amount: w.amount, basis: w.basis, status: "PENDING", notes: `Processed by ${byUserId}` } });
        if (w.bonusKey.startsWith("challenge:")) {
          await tx.ambassadorQuarterlyChallenge.upsert({
            where: { ambassadorId_quarter: { ambassadorId: r.id, quarter: key } },
            create: { ambassadorId: r.id, quarter: key, startDate: tracker.quarter.start, endDate: tracker.quarter.end, targetCount: r.challenge.target, actualCount: r.challenge.count, completed: true, completedAt: now, bonusAmount: w.amount },
            update: { actualCount: r.challenge.count, completed: true, completedAt: now, bonusAmount: w.amount },
          });
        }
      }, { timeout: 30_000, maxWait: 10_000 });
      created += 1;
      amount += w.amount;
    }
  }
  return { created, skipped, amount };
}

/** One one-week extension per ambassador per quarter, granted by the HOG while the quarter is still open. */
export async function grantChallengeExtension(ambassadorId: string, key: string, byUserId: string, now: Date = new Date()): Promise<{ extensionEndDate: string }> {
  const quarter = quarterFromKey(key);
  if (now.getTime() >= quarter.end.getTime()) throw new CommissionsError(`${quarter.label} has ended — an extension must be granted before the quarter closes`);
  const ambassador = await db.ambassador.findUnique({ where: { id: ambassadorId }, select: { id: true, fullName: true } });
  if (!ambassador) throw new CommissionsError("Ambassador not found");
  const existing = await db.ambassadorQuarterlyChallenge.findUnique({ where: { ambassadorId_quarter: { ambassadorId, quarter: key } } });
  if (existing?.extensionGranted) throw new CommissionsError(`${ambassador.fullName} already has their one extension for ${quarter.label}`);
  const extensionEndDate = new Date(quarter.end.getTime() + QUARTERLY_CHALLENGE.extensionDays * DAY);
  const count = await db.ambassadorReferral.count({ where: { ambassadorId, status: "CONVERTED", convertedAt: { gte: quarter.start, lt: quarter.end } } });
  await db.ambassadorQuarterlyChallenge.upsert({
    where: { ambassadorId_quarter: { ambassadorId, quarter: key } },
    create: { ambassadorId, quarter: key, startDate: quarter.start, endDate: quarter.end, extensionGranted: true, extensionEndDate, extensionBy: byUserId, actualCount: count },
    update: { extensionGranted: true, extensionEndDate, extensionBy: byUserId, actualCount: count },
  });
  return { extensionEndDate: extensionEndDate.toISOString() };
}

/** Quarters worth offering in the picker: the current one and the previous four. */
export function recentQuarterKeys(now: Date = new Date()): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  let key = currentQuarterKey(now);
  for (let i = 0; i < 5; i++) {
    out.push({ key, label: quarterFromKey(key).label });
    key = previousQuarterKey(key);
  }
  return out;
}
