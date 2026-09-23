"use client";

import Link from "next/link";
import { LuMessageCircle } from "react-icons/lu";
import { Skeleton } from "@/components/ui/skeleton";
import { SurfaceHeader } from "@/components/ui/surface";
import {
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
  urgent: { icon: "bg-danger/10 text-danger", count: "text-danger" },
  attention: { icon: "bg-gold/10 text-gold", count: "text-gold" },
  routine: { icon: "bg-primary/10 text-primary", count: "text-primary" },
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
      key: "client-late",
      icon: LuMessageCircle,
      label: "Client messages waiting over a day",
      count: actions.clientMessagesOverADay,
      href: "/admin/client-inbox",
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
      key: "client-messages",
      icon: LuMessageCircle,
      label: "Client messages waiting for a reply",
      count: Math.max(0, actions.clientMessagesWaiting - actions.clientMessagesOverADay),
      href: "/admin/client-inbox",
      severity: "attention",
    },
    {
      key: "documents",
      icon: IconQAQueue,
      label: "Chapters and documents to review and release",
      count: actions.documentsToReview,
      href: "/admin/client-inbox#documents",
      severity: "attention",
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

/** What needs a decision — a quiet list on the page, most urgent first. */
export function ActionRequired({ actions }: { actions: ActionCounts }) {
  const items = buildItems(actions);
  const outstanding = items.filter((item) => item.count > 0);
  const total = outstanding.reduce((sum, item) => sum + item.count, 0);

  return (
    <section aria-labelledby="actions-heading" className="min-w-0">
      <SurfaceHeader
        title={<span id="actions-heading">Action required</span>}
        action={
          total > 0 ? (
            <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{total}</span>
          ) : null
        }
      />

      {outstanding.length === 0 ? (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-2xl bg-zone px-6 py-10 text-center">
          <IconCheck className="size-5 text-success" aria-hidden />
          <p className="text-sm font-medium text-foreground">Nothing needs you right now</p>
          <p className="max-w-[36ch] text-[13px] text-muted-foreground">
            Payments to verify, unassigned work, overdue projects and the QA queue all appear here.
          </p>
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-border/70">
          {outstanding.map((item) => {
            const styles = SEVERITY_STYLES[item.severity];
            const Icon = item.icon;

            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className={cn(
                    "-mx-2 flex min-h-12 items-center gap-3 rounded-lg px-2 py-3",
                    "transition-colors duration-fast hover:bg-zone",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  )}
                >
                  <span className={cn("shrink-0 rounded-md p-1.5", styles.icon)}>
                    <Icon className="size-4" aria-hidden />
                  </span>

                  <span className="min-w-0 flex-1 text-sm text-foreground">{item.label}</span>

                  <span className={cn("shrink-0 font-mono text-lg font-medium tabular-nums", styles.count)}>
                    {item.count}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function ActionRequiredSkeleton() {
  return (
    <div>
      <Skeleton className="h-4 w-32" />
      <ul className="mt-3 divide-y divide-border/70">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className="flex items-center gap-3 py-3">
            <Skeleton className="size-7 shrink-0 rounded-md" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-6 shrink-0" />
          </li>
        ))}
      </ul>
    </div>
  );
}
