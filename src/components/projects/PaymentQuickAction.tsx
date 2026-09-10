"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreVertical, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export function PaymentQuickAction({
  projectCode,
  downpaymentStatus,
  balanceStatus,
}: {
  projectCode: string;
  downpaymentStatus: string;
  balanceStatus: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function markPaid(leg: "downpayment" | "balance") {
    setBusy(true);
    try {
      await fetch(`/api/admin/projects/${projectCode}/mark-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leg }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const canMarkDp = downpaymentStatus === "Unpaid";
  const canMarkBal = balanceStatus === "Unpaid";
  const needsVerify = downpaymentStatus === "Paid" || balanceStatus === "Paid";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Payment actions"
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <MoreVertical className="size-4" aria-hidden />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canMarkDp ? (
          <DropdownMenuItem onSelect={() => markPaid("downpayment")}>
            Mark downpayment paid
          </DropdownMenuItem>
        ) : null}
        {canMarkBal ? (
          <DropdownMenuItem onSelect={() => markPaid("balance")}>Mark balance paid</DropdownMenuItem>
        ) : null}
        {(canMarkDp || canMarkBal) && needsVerify ? <DropdownMenuSeparator /> : null}
        {needsVerify ? (
          <DropdownMenuItem asChild>
            <Link href={`/admin/projects/${projectCode}?tab=financials`}>Verify payment…</Link>
          </DropdownMenuItem>
        ) : null}
        {!canMarkDp && !canMarkBal && !needsVerify ? (
          <DropdownMenuItem asChild>
            <Link href={`/admin/projects/${projectCode}`}>Open project</Link>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
