"use client";

import * as React from "react";
import Link from "next/link";
import { LuZap } from "react-icons/lu";
import { cn, formatNaira } from "@/lib/utils";

interface Balance {
  configured: boolean;
  remainingUsd?: number;
  remainingNaira?: number;
  level?: "ok" | "low" | "critical";
}

const USD_COMPACT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});

/** Claude credit left, on every admin page. Amber under 20%, red and pulsing under 10%. */
export function AiBalanceIndicator() {
  const [balance, setBalance] = React.useState<Balance | null>(null);

  React.useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/admin/ai-usage/balance", { cache: "no-store" });
        if (res.ok && alive) setBalance(await res.json());
      } catch {
        /* offline — keep the last value */
      }
    }
    void load();
    const t = setInterval(load, 5 * 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const level = balance?.level ?? "ok";
  const title =
    balance?.configured && balance.remainingUsd != null && balance.remainingNaira != null
      ? `Claude credit — ${USD_COMPACT.format(balance.remainingUsd)} (≈ ${formatNaira(balance.remainingNaira, { compact: true })})`
      : "Claude API usage";
  return (
    <Link
      href="/admin/finance/ai-usage"
      aria-label="Claude API usage"
      title={title}
      className={cn(
        "flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors hover:bg-zone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        level === "critical" ? "animate-pulse text-danger" : level === "low" ? "text-gold" : "text-muted-foreground"
      )}
    >
      <LuZap className="size-[18px]" aria-hidden />
      {balance?.configured && balance.remainingUsd != null ? (
        <span className="hidden font-mono tabular-nums sm:inline">{USD_COMPACT.format(balance.remainingUsd)}</span>
      ) : null}
    </Link>
  );
}
