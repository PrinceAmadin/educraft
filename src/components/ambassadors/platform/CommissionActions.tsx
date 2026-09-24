"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { LuCheck, LuCircleAlert, LuCopy, LuLoaderCircle, LuMessageSquareText, LuPlay, LuSearch, LuTimer, LuX } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TIER_LADDER } from "@/lib/ambassador";
import { formatNaira } from "@/lib/utils";

/** "Generate WhatsApp update": the month's earnings message, editable, copy to clipboard. */
export function WhatsappUpdateButton({ message, monthLabel }: { message: string; monthLabel: string }) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState(message);
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => setText(message), [message]);
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <LuMessageSquareText className="size-4" aria-hidden />
        Generate WhatsApp update
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{monthLabel} earnings update</DialogTitle>
            <DialogDescription>Edit anything, then copy it into the ambassador community.</DialogDescription>
          </DialogHeader>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} className="font-mono text-[13px]" aria-label="WhatsApp message" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(text);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? <LuCheck className="size-4" aria-hidden /> : <LuCopy className="size-4" aria-hidden />}
              {copied ? "Copied" : "Copy to clipboard"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Filters for the history sub-tab: name, month, status, tier — in the URL. */
export function HistoryFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = React.useState(searchParams.get("q") ?? "");
  React.useEffect(() => setSearch(searchParams.get("q") ?? ""), [searchParams]);
  const commit = React.useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("tab", "history");
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      next.delete("page");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );
  React.useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (search === current) return;
    const t = setTimeout(() => commit({ q: search.trim() || null }), 350);
    return () => clearTimeout(t);
  }, [search, searchParams, commit]);
  const active = ["q", "month", "status", "tier"].filter((k) => searchParams.get(k)).length;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <label className="relative col-span-2 block sm:col-span-1">
        <span className="mb-1 block meta-label">Ambassador</span>
        <LuSearch className="pointer-events-none absolute left-3 top-[34px] size-4 text-subtle" aria-hidden />
        <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name" className="h-11 pl-9 text-sm" aria-label="Search ambassadors" />
      </label>
      <label className="block">
        <span className="mb-1 block meta-label">Month</span>
        <Input type="month" value={searchParams.get("month") ?? ""} onChange={(e) => commit({ month: e.target.value || null })} className="h-11 text-sm" aria-label="Month" />
      </label>
      <label className="block">
        <span className="mb-1 block meta-label">Status</span>
        <Select value={searchParams.get("status") ?? ""} onChange={(e) => commit({ status: e.target.value || null })} className="h-11 text-sm" aria-label="Status">
          <option value="">All</option>
          <option value="PENDING">Pending</option>
          <option value="PAID">Paid</option>
        </Select>
      </label>
      <label className="block">
        <span className="mb-1 block meta-label">Tier</span>
        <Select value={searchParams.get("tier") ?? ""} onChange={(e) => commit({ tier: e.target.value || null })} className="h-11 text-sm" aria-label="Tier">
          <option value="">All tiers</option>
          {TIER_LADDER.map((t) => (
            <option key={t.tier} value={t.tier}>
              {t.label}
            </option>
          ))}
        </Select>
      </label>
      {active > 0 ? (
        <div className="col-span-2 flex justify-end sm:col-span-4">
          <Button type="button" variant="ghost" size="sm" onClick={() => router.replace(`${pathname}?tab=history`, { scroll: false })}>
            <LuX className="size-4" aria-hidden />
            Clear {active} filter{active === 1 ? "" : "s"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** "Process Qn bonuses" — appears once the quarter has ended and something is locked in. */
export function ProcessBonusesButton({ quarter, label, amount }: { quarter: string; label: string; amount: number }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ created: number; skipped: number; amount: number } | null>(null);
  async function run() {
    if (!window.confirm(`Process ${label} bonuses? ${formatNaira(amount)} of locked-in bonuses become pending payouts in the finance queue.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ambassadors/commissions/quarterly/process", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quarter }) });
      const body = (await res.json().catch(() => null)) as { error?: string; created?: number; skipped?: number; amount?: number } | null;
      if (!res.ok) throw new Error(body?.error ?? "Could not process the bonuses.");
      setResult({ created: body?.created ?? 0, skipped: body?.skipped ?? 0, amount: body?.amount ?? 0 });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not process the bonuses.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button type="button" onClick={run} disabled={busy}>
        {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuPlay className="size-4" aria-hidden />}
        Process {label} bonuses
      </Button>
      {result ? (
        <span className="text-xs text-muted-foreground">
          {result.created} payout{result.created === 1 ? "" : "s"} created ({formatNaira(result.amount)}){result.skipped ? `, ${result.skipped} already processed` : ""}
        </span>
      ) : null}
      {error ? (
        <span className="flex items-center gap-1 text-xs text-danger" role="alert">
          <LuCircleAlert className="size-3" aria-hidden />
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** "Grant extension?" — one week, once per ambassador per quarter. */
export function ExtendChallengeButton({ ambassadorId, quarter, name }: { ambassadorId: string; quarter: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  async function run() {
    if (!window.confirm(`Give ${name} one extra week on the ${quarter} challenge? This is their only extension this quarter.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ambassadors/${ambassadorId}/challenge/extend`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quarter }) });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not grant the extension.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not grant the extension.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-primary hover:bg-elevated disabled:opacity-50" disabled={busy} onClick={run}>
        {busy ? <LuLoaderCircle className="size-3 animate-spin" aria-hidden /> : <LuTimer className="size-3" aria-hidden />}
        Grant extension
      </button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}
