import type { IconType } from "react-icons";
import { LuBanknote, LuHeartPulse, LuSunrise, LuTrendingUp } from "react-icons/lu";
import type { CcTabKey } from "@/lib/command-center/types";

export type { CcTabKey };

/**
 * The four Command Center tabs (Phase 5). `label` is the full sentence-case
 * name for wide screens, `short` the one-word label under the icon on
 * phones. Safe to import from server components: nothing here renders.
 */
export const CC_TABS = [
  { key: "today", label: "Today", short: "Today", icon: LuSunrise },
  { key: "health", label: "Business health", short: "Health", icon: LuHeartPulse },
  { key: "growth", label: "Growth engine", short: "Growth", icon: LuTrendingUp },
  { key: "finance", label: "Financial pulse", short: "Finance", icon: LuBanknote },
] as const satisfies readonly { key: CcTabKey; label: string; short: string; icon: IconType }[];

export const DEFAULT_CC_TAB: CcTabKey = "today";

/** `?tab=` → a tab key; anything unknown (or missing) opens Today. */
export function parseCcTab(v: string | undefined): CcTabKey {
  return CC_TABS.find((t) => t.key === v)?.key ?? DEFAULT_CC_TAB;
}

/** "/admin" for Today, "/admin?tab=health" for the rest. */
export function hrefForTab(key: CcTabKey): string {
  return key === DEFAULT_CC_TAB ? "/admin" : `/admin?tab=${key}`;
}
