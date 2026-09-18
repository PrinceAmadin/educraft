"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreVertical, Loader2 } from "lucide-react";
import { LuUserPlus, LuUserCog, LuUserMinus, LuEye, LuBanknote, LuCircleCheck } from "react-icons/lu";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import type { ProjectListRow } from "@/lib/services/projects";

/** Pipeline statuses where assign/reassign is possible at all. */
const ASSIGNABLE_STATUSES = new Set([
  "REQUIREMENTS_CONFIRMED",
  "ASSIGNED",
  "IN_PROGRESS",
  "AWAITING_CLIENT_INPUT",
  "REVISION_NEEDED",
]);

interface RowAction {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  href?: string;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
}

function useRowActions(row: ProjectListRow) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function post(path: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/projects/${row.projectId}/${path}`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        // eslint-disable-next-line no-alert
        alert(body?.error ?? "That action could not be completed.");
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function markPaid(leg: "downpayment" | "balance") {
    setBusy(true);
    try {
      await fetch(`/api/admin/projects/${row.projectId}/mark-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leg }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const groups: RowAction[][] = [];

  groups.push([
    { key: "view", label: "View project", icon: LuEye, href: `/admin/projects/${row.projectId}` },
  ]);

  const assignGroup: RowAction[] = [];
  if (row.status === "REQUIREMENTS_CONFIRMED" && !row.worker) {
    assignGroup.push({
      key: "assign",
      label: "Assign worker",
      icon: LuUserPlus,
      href: `/admin/projects/${row.projectId}/assign`,
    });
  } else if (ASSIGNABLE_STATUSES.has(row.status) && row.worker) {
    assignGroup.push({
      key: "reassign",
      label: "Reassign worker",
      icon: LuUserCog,
      href: `/admin/projects/${row.projectId}/assign`,
    });
    if (row.status === "ASSIGNED") {
      assignGroup.push({
        key: "unassign",
        label: "Remove assignment",
        icon: LuUserMinus,
        danger: true,
        onSelect: () => post("unassign"),
      });
    }
  } else if (row.status === "NEW") {
    assignGroup.push({
      key: "assign-hint",
      label: "Assign worker (needs downpayment verified)",
      icon: LuUserPlus,
      href: `/admin/projects/${row.projectId}?tab=financials`,
      hint: "Verify the downpayment first — opens the Financials tab",
    });
  } else if (row.status === "DOWNPAYMENT_VERIFIED") {
    assignGroup.push({
      key: "assign-hint",
      label: "Confirm requirements to assign",
      icon: LuUserPlus,
      href: `/admin/projects/${row.projectId}`,
      hint: "Opens the project — confirm requirements there, then Assign worker appears",
    });
  }
  if (assignGroup.length > 0) groups.push(assignGroup);

  const paymentGroup: RowAction[] = [];
  if (row.downpaymentStatus === "Unpaid") {
    paymentGroup.push({
      key: "mark-dp",
      label: "Mark downpayment paid",
      icon: LuBanknote,
      onSelect: () => markPaid("downpayment"),
    });
  }
  if (row.balanceStatus === "Unpaid") {
    paymentGroup.push({
      key: "mark-bal",
      label: "Mark balance paid",
      icon: LuBanknote,
      onSelect: () => markPaid("balance"),
    });
  }
  if (row.downpaymentStatus === "Paid" || row.balanceStatus === "Paid") {
    paymentGroup.push({
      key: "verify",
      label: "Verify payment…",
      icon: LuCircleCheck,
      href: `/admin/projects/${row.projectId}?tab=financials`,
    });
  }
  if (paymentGroup.length > 0) groups.push(paymentGroup);

  return { groups, busy };
}

/**
 * One shared action set, rendered through two different triggers: the
 * three-dot button (works by tap on touch devices — the "three-dot action
 * button" the spec calls for on mobile/tablet) and a right-click context menu
 * wrapping the row (desktop). Same component, same server calls, same
 * authorization underneath either way — there is no separate "mobile menu"
 * with fewer checks.
 */
export function ProjectRowMenu({ row, children }: { row: ProjectListRow; children: React.ReactNode }) {
  const { groups, busy } = useRowActions(row);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {groups.map((group, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <ContextMenuSeparator /> : null}
            {group.map((action) => (
              <ContextMenuItem
                key={action.key}
                disabled={action.disabled || busy}
                title={action.hint}
                className={action.danger ? "text-danger focus:bg-danger/10" : undefined}
                onSelect={action.onSelect}
                asChild={Boolean(action.href)}
              >
                {action.href ? (
                  <Link href={action.href}>
                    <action.icon className="size-4" aria-hidden />
                    {action.label}
                  </Link>
                ) : (
                  <>
                    <action.icon className="size-4" aria-hidden />
                    {action.label}
                  </>
                )}
              </ContextMenuItem>
            ))}
          </React.Fragment>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** The visible three-dot trigger — the always-reachable "normal button" version of the same menu. */
export function ProjectRowMenuButton({ row }: { row: ProjectListRow }) {
  const { groups, busy } = useRowActions(row);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Actions for ${row.projectId}`}
          onClick={(e) => e.stopPropagation()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <MoreVertical className="size-4" aria-hidden />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {groups.map((group, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <DropdownMenuSeparator /> : null}
            {group.map((action) => (
              <DropdownMenuItem
                key={action.key}
                disabled={action.disabled || busy}
                title={action.hint}
                className={action.danger ? "text-danger focus:bg-danger/10" : undefined}
                onSelect={action.onSelect}
                asChild={Boolean(action.href)}
              >
                {action.href ? (
                  <Link href={action.href}>
                    <action.icon className="size-4" aria-hidden />
                    {action.label}
                  </Link>
                ) : (
                  <>
                    <action.icon className="size-4" aria-hidden />
                    {action.label}
                  </>
                )}
              </DropdownMenuItem>
            ))}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
