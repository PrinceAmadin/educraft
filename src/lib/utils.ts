import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** ₦ formatting for all money in the app. */
export function formatNaira(
  amount: number | null | undefined,
  opts: { compact?: boolean; decimals?: boolean } = {}
) {
  if (amount == null) return "—";
  if (opts.compact) {
    if (Math.abs(amount) >= 1_000_000)
      return `₦${(amount / 1_000_000).toFixed(2).replace(/\.00$/, "")}M`;
    if (Math.abs(amount) >= 1_000)
      return `₦${(amount / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : 0,
  }).format(amount);
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Compact relative time — "2m ago", "15m ago", "3h ago", "2d ago".
 * Deliberately not Intl.RelativeTimeFormat: the activity feed wants the terse
 * ledger form, and this stays stable between server and client renders.
 */
export function timeAgo(value: Date | string | number, now: Date = new Date()) {
  const then = value instanceof Date ? value : new Date(value);
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);

  if (!Number.isFinite(seconds)) return "—";
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  return `${Math.floor(months / 12)}y ago`;
}

/** First name for greetings. "Prince Amadin" → "Prince". */
export function firstName(name: string | null | undefined, fallback = "there") {
  const first = name?.trim().split(/\s+/)[0];
  return first && first.length > 0 ? first : fallback;
}

/** "Aug 16, 2026" — the app's standard short date. */
export function formatDate(value: Date | string | null | undefined) {
  if (value == null) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** "Aug 16, 2026, 2:15 PM" — for timeline entries. */
export function formatDateTime(value: Date | string | null | undefined) {
  if (value == null) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export type DeadlineUrgency = "none" | "ok" | "soon" | "urgent" | "critical" | "overdue";

export interface DeadlineInfo {
  urgency: DeadlineUrgency;
  /** Whole days until the deadline; negative once it has passed. null when no deadline. */
  daysLeft: number | null;
  label: string;
}

/**
 * Deadline banding from the blueprint: 5 days gentle, 3 days urgent, 1 day
 * critical, passed = OVERDUE. `soon` covers the 4–5 day window so the list can
 * tint a row yellow without shouting.
 */
export function deadlineInfo(
  deadline: Date | string | null | undefined,
  now: Date = new Date()
): DeadlineInfo {
  if (deadline == null) return { urgency: "none", daysLeft: null, label: "No deadline" };

  const d = deadline instanceof Date ? deadline : new Date(deadline);
  if (Number.isNaN(d.getTime())) return { urgency: "none", daysLeft: null, label: "No deadline" };

  const msPerDay = 86_400_000;
  const daysLeft = Math.ceil((d.getTime() - now.getTime()) / msPerDay);

  if (daysLeft < 0) {
    const overdueBy = Math.abs(daysLeft);
    return {
      urgency: "overdue",
      daysLeft,
      label: `Overdue by ${overdueBy} day${overdueBy === 1 ? "" : "s"}`,
    };
  }
  if (daysLeft === 0) return { urgency: "critical", daysLeft, label: "Due today" };
  if (daysLeft === 1) return { urgency: "critical", daysLeft, label: "1 day left" };
  if (daysLeft <= 3) return { urgency: "urgent", daysLeft, label: `${daysLeft} days left` };
  if (daysLeft <= 5) return { urgency: "soon", daysLeft, label: `${daysLeft} days left` };
  return { urgency: "ok", daysLeft, label: `${daysLeft} days left` };
}
