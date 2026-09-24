import type { ActivityStatus } from "@/lib/ambassadors/tier-utils";

/** Pure display helpers for the Ambassador Platform (server and client). */

const DAY = 86_400_000;

/** "today", "3 days ago", "1 week ago", "6 weeks ago", "3 months ago" — or "never". */
export function relativeDays(value: Date | string | null | undefined, now: Date = new Date()): string {
  if (!value) return "never";
  const d = typeof value === "string" ? new Date(value) : value;
  const days = Math.floor((now.getTime() - d.getTime()) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (days < 60) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (days < 365) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

/** "Aug '25" */
export function shortMonthYear(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const month = d.toLocaleString("en-GB", { month: "short", timeZone: "Africa/Lagos" });
  return `${month} '${String(d.getFullYear()).slice(-2)}`;
}

/** Badge classes per activity status: Active green, Dormant amber, Inactive red, New blue. */
export const ACTIVITY_BADGE: Record<ActivityStatus, string> = {
  ACTIVE: "bg-success/15 text-success",
  DORMANT: "bg-gold/15 text-gold",
  INACTIVE: "bg-danger/15 text-danger",
  NEW: "bg-info/15 text-info",
};
