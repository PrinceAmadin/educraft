"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CircleAlert, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProjectTabs, type ProjectTab } from "@/components/projects/ProjectTabs";
import { EmptyState } from "@/components/shared/EmptyState";
import { LuWallet } from "react-icons/lu";
import { cn, formatNaira } from "@/lib/utils";
import type { PayoutGroup, PendingPayouts } from "@/lib/services/payouts";

type Kind = "worker" | "ambassador";

/**
 * What is owed, grouped by recipient. `canMarkPaid` (founder and CFO) shows
 * the controls that record a transfer; the COO reviews the same queue with
 * nothing to press.
 */
export function PayoutQueue({ data, canMarkPaid = true }: { data: PendingPayouts; canMarkPaid?: boolean }) {
  const { totals } = data;
  const grandTotal = totals.workerAmount + totals.ambassadorAmount;

  const tabs: ProjectTab[] = [
    {
      id: "workers",
      label: `Worker payouts (${totals.workerCount})`,
      content: <PayoutTable kind="worker" groups={data.workers} amount={totals.workerAmount} canMarkPaid={canMarkPaid} />,
    },
    {
      id: "ambassadors",
      label: `Ambassador commissions (${totals.ambassadorCount})`,
      content: (
        <PayoutTable kind="ambassador" groups={data.ambassadors} amount={totals.ambassadorAmount} canMarkPaid={canMarkPaid} />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-zone p-4 sm:p-5">
        <p className="meta-label">
          Total pending
        </p>
        <p className="mt-1 font-mono text-2xl font-medium tabular-nums text-foreground">
          {formatNaira(grandTotal)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatNaira(totals.workerAmount)} to {totals.workerCount} worker
          {totals.workerCount === 1 ? "" : "s"} · {formatNaira(totals.ambassadorAmount)} to{" "}
          {totals.ambassadorCount} ambassador{totals.ambassadorCount === 1 ? "" : "s"}
        </p>
      </div>

      <div className="rounded-2xl bg-zone p-4 sm:p-5">
        <ProjectTabs tabs={tabs} />
      </div>
    </div>
  );
}

function PayoutTable({
  kind,
  groups,
  amount,
  canMarkPaid,
}: {
  kind: Kind;
  groups: PayoutGroup[];
  amount: number;
  canMarkPaid: boolean;
}) {
  const router = useRouter();
  const [reference, setReference] = React.useState("");
  const [date, setDate] = React.useState("");
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  const run = React.useCallback(
    async (scope: "one" | "all", id?: string) => {
      setPending(id ?? "all");
      setError(null);
      setDone(null);
      try {
        const res = await fetch("/api/admin/finance/payouts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, scope, id, reference: reference.trim(), date }),
        });
        const body = (await res.json().catch(() => null)) as
          | { paidCount?: number; totalAmount?: number; error?: string }
          | null;
        if (!res.ok) throw new Error(body?.error ?? "Could not record the payment.");
        setDone(
          `Recorded ${formatNaira(body?.totalAmount ?? 0)} across ${body?.paidCount ?? 0} recipient${
            body?.paidCount === 1 ? "" : "s"
          }.`
        );
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not record the payment.");
      } finally {
        setPending(null);
      }
    },
    [kind, reference, date, router]
  );

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={LuWallet}
        title={kind === "worker" ? "No worker payouts due" : "No ambassador commissions due"}
        description="Payouts appear here once a project reaches COMPLETED and hasn't been paid out."
        className="py-10"
      />
    );
  }

  return (
    <div className="space-y-4">
      {!canMarkPaid ? (
        <p className="text-[13px] text-muted-foreground">
          For review only: recording a payment is the CFO&apos;s step. Submitting the monthly payout list from here
          arrives with the Finance Platform.
        </p>
      ) : null}
      {canMarkPaid ? (
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block meta-label">
            Payment date
          </span>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-10 w-44 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block meta-label">
            Reference
          </span>
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Transfer reference"
            className="h-10 w-52 text-sm"
          />
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={pending !== null}
          onClick={() => run("all")}
        >
          {pending === "all" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Mark all paid ({formatNaira(amount)})
        </Button>
      </div>
      ) : null}

      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
      {done ? (
        <p className="flex items-center gap-2 text-sm text-success">
          <Check className="size-4 shrink-0" aria-hidden />
          {done}
        </p>
      ) : null}

      <ul className="space-y-3">
        {groups.map((g) => (
          <li
            key={g.id}
            className="surface p-4 sm:flex sm:items-start sm:justify-between sm:gap-4"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/admin/${kind === "worker" ? "workers" : "ambassadors"}/${g.id}`}
                  className="text-sm font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:underline"
                >
                  {g.name}
                </Link>
                <span className="font-mono text-xs text-muted-foreground">{g.code}</span>
                {g.rate != null ? (
                  <span className="rounded-full bg-elevated px-2 py-0.5 text-[11px] text-muted-foreground">
                    {g.rate}%
                  </span>
                ) : null}
              </div>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {g.projectCodes.join(", ")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {g.bank.bankName ?? "No bank on file"}
                {g.bank.accountNumber ? ` · ${g.bank.accountNumber}` : ""}
                {g.bank.accountName ? ` · ${g.bank.accountName}` : ""}
              </p>
            </div>

            <div className="mt-3 flex shrink-0 items-center gap-3 sm:mt-0">
              <span className="font-mono text-sm font-medium tabular-nums text-foreground">
                {formatNaira(g.amount)}
              </span>
              {canMarkPaid ? (
                <Button
                  size="sm"
                  disabled={pending !== null}
                  onClick={() => run("one", g.id)}
                  className={cn(pending === g.id && "opacity-80")}
                >
                  {pending === g.id ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Check className="size-4" aria-hidden />
                  )}
                  Pay
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
