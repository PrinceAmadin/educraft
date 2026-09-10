"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IconActionRequired,
  IconAssign,
  IconCheck,
  IconDeadline,
  IconQAQueue,
  IconRevision,
  IconVerifyPayment,
  type AppIcon,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { ActionCounts } from "@/types/dashboard";

type Severity = "urgent" | "attention" | "routine";

const SEVERITY_STYLES: Record<Severity, { icon: string; count: string }> = {
  urgent: { icon: "bg-danger/12 text-danger", count: "text-danger" },
  attention: { icon: "bg-gold/12 text-gold", count: "text-gold" },
  routine: { icon: "bg-primary/12 text-primary", count: "text-primary" },
};

interface ActionItem {
  key: string;
  icon: AppIcon;
  label: string;
  count: number;
  href: string;
  severity: Severity;
}

/** Every row is a route to the screen where the thing gets resolved. */
function buildItems(actions: ActionCounts): ActionItem[] {
  return [
    {
      key: "overdue",
      icon: IconDeadline,
      label: "Projects past their internal deadline",
      count: actions.overdue,
      href: "/admin/projects?flag=overdue",
      severity: "urgent",
    },
    {
      key: "revisions",
      icon: IconRevision,
      label: "Past the 3-revision cap — needs founder review",
      count: actions.revisionEscalations,
      href: "/admin/projects?flag=revision-escalated",
      severity: "urgent",
    },
    {
      key: "downpayments",
      icon: IconVerifyPayment,
      label: "Downpayments marked paid, awaiting verification",
      count: actions.downpaymentsToVerify,
      href: "/admin/finance?verify=downpayment",
      severity: "attention",
    },
    {
      key: "balances",
      icon: IconVerifyPayment,
      label: "Balance payments awaiting verification",
      count: actions.balancesToVerify,
      href: "/admin/finance?verify=balance",
      severity: "attention",
    },
    {
      key: "assignment",
      icon: IconAssign,
      label: "Confirmed and waiting on a worker",
      count: actions.awaitingAssignment,
      href: "/admin/projects?status=REQUIREMENTS_CONFIRMED&worker=unassigned",
      severity: "attention",
    },
    {
      key: "qa",
      icon: IconQAQueue,
      label: "Submitted work in the QA queue",
      count: actions.qaQueue,
      href: "/admin/qa",
      severity: "routine",
    },
  ];
}

export function ActionRequired({ actions }: { actions: ActionCounts }) {
  const items = buildItems(actions);
  const outstanding = items.filter((item) => item.count > 0);
  const total = outstanding.reduce((sum, item) => sum + item.count, 0);

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <IconActionRequired className="size-4 text-muted-foreground" aria-hidden />
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Action Required
          </CardTitle>
        </div>
        {total > 0 ? (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{total}</span>
        ) : null}
      </CardHeader>

      <CardContent className="flex-1 p-0">
        {outstanding.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <IconCheck className="size-6 text-success" aria-hidden />
            <p className="text-sm font-medium text-foreground">Nothing needs you right now</p>
            <p className="max-w-[36ch] text-xs text-muted-foreground">
              Payments to verify, unassigned work, overdue projects and the QA queue all appear
              here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {outstanding.map((item) => {
              const styles = SEVERITY_STYLES[item.severity];
              const Icon = item.icon;

              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex min-h-12 items-center gap-3 px-4 py-3 sm:px-5",
                      "transition-colors duration-fast hover:bg-elevated",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    )}
                  >
                    <span className={cn("shrink-0 rounded-md p-1.5", styles.icon)}>
                      <Icon className="size-4" aria-hidden />
                    </span>

                    <span className="min-w-0 flex-1 text-sm text-foreground">{item.label}</span>

                    <span
                      className={cn(
                        "shrink-0 font-mono text-lg font-medium tabular-nums",
                        styles.count
                      )}
                    >
                      {item.count}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function ActionRequiredSkeleton() {
  return (
    <Card>
      <CardHeader className="border-b border-border p-4 sm:p-5">
        <Skeleton className="h-4 w-36" />
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <Skeleton className="size-7 shrink-0 rounded-md" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-5 w-6 shrink-0" />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
