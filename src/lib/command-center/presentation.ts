import {
  LuBanknote,
  LuBookOpen,
  LuCircleAlert,
  LuCircleCheck,
  LuCircleMinus,
  LuClipboardCheck,
  LuClock,
  LuFileCheck,
  LuFileText,
  LuFileWarning,
  LuFlag,
  LuMessageCircle,
  LuMoveRight,
  LuPackageCheck,
  LuPiggyBank,
  LuRotateCcw,
  LuTrendingUp,
  LuTriangleAlert,
  LuTrophy,
  LuUserCheck,
  LuUserPlus,
  LuUserX,
  LuWallet,
} from "react-icons/lu";
import type { AppIcon } from "@/lib/icons";
import type { AlertKind, AlertSeverity, FeedKind, KpiUnit, RagStatus, TierKey } from "./types";
import { pctChange } from "./time";

/**
 * How the Command Center shows things (Phase 5): icons and tones per feed
 * kind and alert kind, RAG badges, and the WAT date/number formatters. Pure
 * and client-safe — every component reads from here so light and dark stay
 * consistent and no glyph is ever an emoji.
 */

export type Tone = "success" | "danger" | "gold" | "primary" | "muted";

export const FEED_KIND_META: Record<FeedKind, { icon: AppIcon; tone: Tone; label: string }> = {
  payment: { icon: LuBanknote, tone: "success", label: "Payment" },
  approved: { icon: LuCircleCheck, tone: "success", label: "QA approved" },
  delivered: { icon: LuPackageCheck, tone: "success", label: "Delivered" },
  completed: { icon: LuCircleCheck, tone: "success", label: "Completed" },
  submitted: { icon: LuFileText, tone: "primary", label: "Submitted" },
  status: { icon: LuMoveRight, tone: "muted", label: "Status change" },
  overdue: { icon: LuCircleAlert, tone: "danger", label: "Overdue" },
  warning: { icon: LuTriangleAlert, tone: "gold", label: "Needs a look" },
  person: { icon: LuUserPlus, tone: "primary", label: "People" },
  tier: { icon: LuTrophy, tone: "gold", label: "Tier change" },
  payout: { icon: LuWallet, tone: "primary", label: "Payout" },
  research: { icon: LuClipboardCheck, tone: "primary", label: "Research" },
  document: { icon: LuFileCheck, tone: "primary", label: "Document" },
};

export const ALERT_KIND_ICON: Record<AlertKind, AppIcon> = {
  overdue: LuClock,
  payouts: LuWallet,
  worker_flags: LuFlag,
  platinum_bonus: LuTrophy,
  ops_reserve: LuPiggyBank,
  unassigned: LuUserPlus,
  qa_waiting: LuClipboardCheck,
  corrections: LuFileWarning,
  activation: LuTrendingUp,
  dormant_workers: LuUserX,
  messages: LuMessageCircle,
  documents: LuFileCheck,
  verify_payments: LuBanknote,
  research: LuBookOpen,
  applications: LuUserCheck,
  revision_cap: LuRotateCcw,
};

/** Icon bubble + text classes per alert severity (the old ActionRequired idiom). */
export const SEVERITY_STYLES: Record<AlertSeverity, { icon: string; text: string }> = {
  critical: { icon: "bg-danger/10 text-danger", text: "text-danger" },
  attention: { icon: "bg-gold/10 text-gold", text: "text-gold" },
};

export const RAG_META: Record<
  RagStatus,
  { label: string; badge: "success" | "gold" | "danger" | "neutral"; icon: AppIcon }
> = {
  green: { label: "On track", badge: "success", icon: LuCircleCheck },
  amber: { label: "Watch", badge: "gold", icon: LuTriangleAlert },
  red: { label: "Off track", badge: "danger", icon: LuCircleAlert },
  neutral: { label: "No data", badge: "neutral", icon: LuCircleMinus },
};

/** Text tone classes for a delta or a trend line. */
export const TONE_TEXT: Record<Tone, string> = {
  success: "text-success",
  danger: "text-danger",
  gold: "text-gold",
  primary: "text-primary",
  muted: "text-muted-foreground",
};

// ── Formatting ───────────────────────────────────────────────────

// "en-US" rather than "en-NG": Nigerian English renders "16:23" and
// "24 September 2026"; the dashboard wants "4:23 PM" and "September 24, 2026".
const WAT_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Lagos", hour: "numeric", minute: "2-digit" });
const WAT_DATE = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Lagos", month: "long", day: "numeric", year: "numeric" });
const COUNT = new Intl.NumberFormat("en-NG");

function toDate(iso: string | Date): Date | null {
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "4:23 PM" in WAT. */
export function formatWatTime(iso: string | Date): string {
  const d = toDate(iso);
  return d ? WAT_TIME.format(d) : "—";
}

/** "September 24, 2026" in WAT. */
export function formatWatDate(iso: string | Date): string {
  const d = toDate(iso);
  return d ? WAT_DATE.format(d) : "—";
}

/** "91%" — or "—" when there is nothing to show. */
export function formatPercent(v: number | null, dp = 0): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(dp)}%`;
}

/** "1,234,567" with en-NG grouping. */
export function formatCount(n: number): string {
  return COUNT.format(n);
}

/**
 * The "vs last month" line under a KPI, in the finance dashboard's words.
 * Naira and counts compare by percentage; percentages compare by points.
 */
export function deltaLabel(
  current: number,
  previous: number | null,
  unit: KpiUnit,
  what = "last month"
): { text: string; tone: "success" | "danger" | "muted" } {
  if (previous === null) {
    return { text: what === "last month" ? "No last month to compare" : "Nothing to compare yet", tone: "muted" };
  }
  if (unit === "percent") {
    const pts = Math.round((current - previous) * 10) / 10;
    if (pts === 0) return { text: `Same as ${what}`, tone: "muted" };
    return { text: `${pts > 0 ? "↑" : "↓"} ${Math.abs(pts)} pts vs ${what}`, tone: pts > 0 ? "success" : "danger" };
  }
  const pct = pctChange(current, previous);
  if (pct === null) return { text: `Up from 0 ${what}`, tone: "success" };
  if (pct === 0) return { text: `Same as ${what}`, tone: "muted" };
  return { text: `${pct > 0 ? "↑" : "↓"} ${Math.abs(pct)}% vs ${what}`, tone: pct > 0 ? "success" : "danger" };
}

// ── Tiers ────────────────────────────────────────────────────────

/** Chart colours per tier: the TierBadge families, not the spec's hexes. */
export const TIER_COLORS: Record<TierKey, string> = {
  BRONZE: "#b45309",
  SILVER: "#94a3b8",
  GOLD: "hsl(var(--gold))",
  PLATINUM: "hsl(var(--primary))",
};

export const TIER_LABELS: Record<TierKey, string> = {
  BRONZE: "Bronze",
  SILVER: "Silver",
  GOLD: "Gold",
  PLATINUM: "Platinum",
};

/** Fixed series order for stacked charts and legends. */
export const TIER_ORDER: readonly TierKey[] = ["BRONZE", "SILVER", "GOLD", "PLATINUM"];
