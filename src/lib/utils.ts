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
