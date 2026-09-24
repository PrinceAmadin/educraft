"use client";

import * as React from "react";
import Link from "next/link";
import { LuCircleAlert, LuCircleCheck, LuInfo, LuTriangleAlert } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ActionItem, ActionRequired, ActionSeverity } from "@/lib/services/operations/pipeline";

const SEVERITY: Record<ActionSeverity, { icon: React.ComponentType<{ className?: string }>; text: string; ring: string }> = {
  urgent: { icon: LuCircleAlert, text: "text-danger", ring: "bg-danger/10 text-danger" },
  attention: { icon: LuTriangleAlert, text: "text-gold", ring: "bg-gold/10 text-gold" },
  routine: { icon: LuInfo, text: "text-primary", ring: "bg-primary/10 text-primary" },
};

const INITIAL = 8;

/**
 * The COO's first stop every morning: one line per project that needs a
 * hand, most urgent first, each with the one button that resolves it.
 */
export function OpsActionRequired({ actions }: { actions: ActionRequired }) {
  const [showAll, setShowAll] = React.useState(false);
  const items = showAll ? actions.items : actions.items.slice(0, INITIAL);

  return (
    <section aria-labelledby="ops-actions-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="ops-actions-heading" className="text-[15px] font-semibold text-foreground">
          Action required
          <span className="ml-2 font-mono text-[13px] font-normal tabular-nums text-muted-foreground">{actions.total}</span>
        </h2>
        {actions.total > 0 ? (
          <p className="flex gap-3 font-mono text-[12px] tabular-nums">
            <span className="text-danger">{actions.counts.urgent} urgent</span>
            <span className="text-gold">{actions.counts.attention} attention</span>
            <span className="text-muted-foreground">{actions.counts.routine} routine</span>
          </p>
        ) : null}
      </div>

      {actions.total === 0 ? (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-2xl bg-zone px-6 py-10 text-center">
          <LuCircleCheck className="size-5 text-success" aria-hidden />
          <p className="text-sm font-medium text-foreground">Nothing needs you right now</p>
          <p className="max-w-[40ch] text-[13px] text-muted-foreground">
            Overdue work, unassigned projects, reviews sitting over a day, deadlines inside three days and supervisor corrections all appear here.
          </p>
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-border/70">
          {items.map((item) => (
            <ActionRow key={item.key} item={item} />
          ))}
        </ul>
      )}

      {actions.total > INITIAL ? (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
          {showAll ? "Show fewer" : `Show all ${actions.total}`}
        </Button>
      ) : null}
    </section>
  );
}

function ActionRow({ item }: { item: ActionItem }) {
  const s = SEVERITY[item.severity];
  const Icon = s.icon;
  return (
    <li className="flex items-start gap-3 py-3 sm:items-center">
      <span className={cn("mt-0.5 shrink-0 rounded-md p-1.5 sm:mt-0", s.ring)}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 sm:grid sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1.4fr)] sm:items-center sm:gap-4">
        <Link href={`/admin/projects/${item.projectCode}`} className="font-mono text-sm font-medium text-foreground hover:text-primary">
          {item.projectCode}
        </Link>
        <p className="truncate text-[13px] text-muted-foreground">
          {item.serviceName} · {item.clientName}
          {item.workerName ? ` · ${item.workerName}` : ""}
        </p>
        <p className="min-w-0">
          <span className={cn("text-[13px] font-semibold", s.text)}>{item.reason}</span>
          {item.detail ? <span className="block truncate text-[12px] text-muted-foreground">{item.detail}</span> : null}
        </p>
      </div>
      <Button asChild size="sm" variant={item.severity === "urgent" ? "default" : "outline"} className="shrink-0">
        <Link href={item.action.href}>{item.action.label}</Link>
      </Button>
    </li>
  );
}
