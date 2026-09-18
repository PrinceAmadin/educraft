"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuCheck, LuCircleAlert, LuLoaderCircle, LuSearch, LuUsers } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ParentCandidate } from "@/lib/services/ambassadors";
import { MAX_SUB_AMBASSADORS, isValidParentRate } from "@/lib/commission";
import { cn } from "@/lib/utils";

/**
 * Who this ambassador is a sub-ambassador of, and at what rate their parent
 * earns from their jobs (CLAUDE.md's Core/Sub chain, with the admin free to
 * set the percentage per pair). "None" is always offered.
 */
const ACTIVATED_TIERS = new Set(["SILVER", "GOLD", "PLATINUM"]);

export function ParentAssignment({
  ambassadorId,
  current,
  currentRate,
  candidates,
  defaultRate,
}: {
  ambassadorId: string;
  current: { id: string; ambassadorId: string; fullName: string; tier: string } | null;
  currentRate: number | null;
  candidates: ParentCandidate[];
  defaultRate: number;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(current?.id ?? null);
  const [rateDraft, setRateDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function openDialog() {
    setSelectedId(current?.id ?? null);
    setRateDraft("");
    setQuery("");
    setError(null);
    setOpen(true);
  }

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? candidates.filter((c) => [c.name, c.code].some((v) => v.toLowerCase().includes(needle)))
    : candidates;

  async function save() {
    setBusy(true);
    setError(null);
    const rateNum = rateDraft.trim() === "" ? undefined : Number(rateDraft);
    if (rateNum != null && !isValidParentRate(rateNum)) {
      setError("Enter a valid rate between 0% and 50%.");
      setBusy(false);
      return;
    }
    try {
      const res = await fetch(`/api/admin/ambassadors/${ambassadorId}/parent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: selectedId, rate: selectedId ? rateNum : undefined }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not save.");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Parent ambassador</h2>
          {current ? (
            <p className="mt-1 text-sm text-muted-foreground">
              A sub-ambassador of{" "}
              <Link href={`/admin/ambassadors/${current.id}`} className="text-primary hover:underline">
                {current.fullName}
              </Link>
              {ACTIVATED_TIERS.has(current.tier) ? (
                <>
                  {" "}
                  — they earn{" "}
                  <span className="font-mono">{currentRate ?? defaultRate}%</span> of this ambassador&apos;s
                  jobs.
                </>
              ) : (
                <> — but {current.fullName} hasn&apos;t reached Silver yet, so no commission until they do.</>
              )}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Not linked under a parent. Link them to one to share a slice of their commission.
            </p>
          )}
        </div>
        <Button size="sm" variant="outline" className="shrink-0" onClick={openDialog}>
          {current ? "Change" : "Link a parent"}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>Parent ambassador</DialogTitle>
            <DialogDescription>
              Max {MAX_SUB_AMBASSADORS} subs per parent, one level deep, and a parent only earns once
              they reach Silver.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <label className="relative block">
              <LuSearch
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle"
                aria-hidden
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or ID"
                className="pl-10"
                aria-label="Search ambassadors"
              />
            </label>

            <div role="listbox" aria-label="Parent ambassador" className="max-h-64 overflow-y-auto overflow-x-hidden rounded-xl bg-zone p-1">
              <button
                type="button"
                role="option"
                aria-selected={selectedId === null}
                onClick={() => setSelectedId(null)}
                className={cn(
                  "flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                  selectedId === null ? "bg-card shadow-soft" : "hover:bg-card/60"
                )}
              >
                <span>
                  <span className="block text-sm font-medium text-foreground">None</span>
                  <span className="block text-xs text-muted-foreground">Not linked to a parent</span>
                </span>
                {selectedId === null ? <LuCheck className="size-4 shrink-0 text-primary" aria-hidden /> : null}
              </button>
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">No ambassador matches.</p>
              ) : (
                filtered.map((c) => {
                  const active = c.id === selectedId;
                  const disabled = !c.hasRoom && c.id !== current?.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      aria-disabled={disabled}
                      disabled={disabled}
                      onClick={() => setSelectedId(c.id)}
                      className={cn(
                        "flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                        disabled
                          ? "cursor-not-allowed opacity-50"
                          : active
                            ? "bg-card shadow-soft"
                            : "hover:bg-card/60"
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">{c.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          <span className="font-mono">{c.code}</span> · {c.childrenCount}/{MAX_SUB_AMBASSADORS} subs
                          {c.activated ? "" : " · below Silver — won't earn yet"}
                          {disabled ? " · full" : ""}
                        </span>
                      </span>
                      {active ? <LuCheck className="size-4 shrink-0 text-primary" aria-hidden /> : null}
                    </button>
                  );
                })
              )}
            </div>

            {selectedId ? (
              <div>
                <label htmlFor="parent-rate" className="meta-label mb-1.5 block">
                  Commission rate for this pair
                </label>
                <div className="relative max-w-40">
                  <Input
                    id="parent-rate"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={50}
                    step={0.5}
                    value={rateDraft}
                    onChange={(e) => setRateDraft(e.target.value)}
                    placeholder={String(defaultRate)}
                    className="pr-9 font-mono tabular-nums"
                  />
                  <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Leave blank to use the default ({defaultRate}%, set in Settings). 0% links them without
                  paying a commission.
                </p>
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="flex items-start gap-2 text-sm text-danger">
                <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={busy} onClick={save}>
                {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function SubAmbassadorsList({
  subs,
  parentCommission,
}: {
  subs: { id: string; ambassadorId: string; fullName: string; tier: string; parentCommRate: number | null }[];
  parentCommission: {
    totalEarned: number;
    totalPaid: number;
    balance: number;
    bySub: { id: string; ambassadorId: string; fullName: string; amount: number }[];
  } | null;
}) {
  if (subs.length === 0) return null;

  const amountBySub = new Map(parentCommission?.bySub.map((s) => [s.id, s.amount]) ?? []);

  return (
    <section className="surface p-4">
      <div className="flex items-center gap-2">
        <LuUsers className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">
          Sub-ambassadors
          <span className="ml-1.5 font-mono text-xs text-muted-foreground">{subs.length}</span>
        </h2>
      </div>
      <ul className="mt-2 divide-y divide-border/80">
        {subs.map((c) => (
          <li key={c.id}>
            <Link
              href={`/admin/ambassadors/${c.id}`}
              className="flex min-h-12 items-center justify-between gap-3 py-2.5 transition-colors hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm text-foreground">{c.fullName}</span>
                <span className="block truncate font-mono text-xs text-muted-foreground">
                  {c.ambassadorId} · {c.parentCommRate != null ? `${c.parentCommRate}% to you` : "default rate"}
                </span>
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {amountBySub.has(c.id) ? `earned you ${(amountBySub.get(c.id) ?? 0).toLocaleString("en-NG")}` : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {parentCommission && parentCommission.totalEarned > 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {parentCommission.balance > 0
            ? `₦${parentCommission.balance.toLocaleString("en-NG")} owed from completed sub-ambassador jobs.`
            : "All commission from sub-ambassador jobs has been paid out."}
        </p>
      ) : null}
    </section>
  );
}
