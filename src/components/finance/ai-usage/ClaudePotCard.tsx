"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuCoins, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/forms/Field";
import type { ClaudePot } from "@/lib/services/finance/pots";
import { formatNaira } from "@/lib/utils";

/**
 * The Claude API pot on the AI usage tab (decision 5). It holds the cash set
 * aside for Claude (its share of Operations Reserve); "you can top up about $X"
 * is that cash at the current rate. Logging a top-up records the credits bought:
 * the naira leaves the pot and the balance card's loaded USD goes up.
 */
export function ClaudePotCard({ pot, canLogTopUp }: { pot: ClaudePot; canLogTopUp: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [ngn, setNgn] = React.useState("");
  const [usd, setUsd] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);

  async function submit() {
    setError(null);
    const amountNgn = Number(ngn);
    if (!Number.isFinite(amountNgn) || amountNgn <= 0) return setError("Enter the amount you paid, in naira.");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ai-usage/top-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountNgn, amountUsd: usd.trim() ? Number(usd) : undefined, reference: reference.trim() || undefined }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; approvalStatus?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "Could not log the top-up.");
      setOpen(false);
      setNgn("");
      setUsd("");
      setReference("");
      setNote(body?.approvalStatus === "PENDING_APPROVAL" ? "Logged — it waits for the founder's approval before the cash leaves the pot." : null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log the top-up.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="meta-label flex items-center gap-1.5">
            <LuCoins className="size-3.5 text-primary" aria-hidden />
            Claude API pot
          </p>
          <p className="mt-1 font-mono text-2xl font-medium tabular-nums text-foreground">{formatNaira(pot.balanceNaira)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You can top up about <span className="font-mono tabular-nums text-foreground">${pot.canTopUpUsd.toLocaleString("en-US")}</span> of Anthropic credits
            {" "}at ₦{pot.usdRate.toLocaleString("en-NG")}/$.
          </p>
        </div>
        {canLogTopUp ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            Log top-up
          </Button>
        ) : null}
      </div>
      {note ? <p className="mt-3 text-xs text-muted-foreground">{note}</p> : null}

      <Dialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log a Claude credit top-up</DialogTitle>
            <DialogDescription>
              Record Anthropic credits you bought with the Claude API pot. The naira leaves the pot and Operations
              Reserve; the USD is added to the credit balance above.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Amount paid (₦)" htmlFor="topup-ngn" required>
              <Input id="topup-ngn" inputMode="numeric" value={ngn} onChange={(e) => setNgn(e.target.value)} placeholder="45000" />
            </Field>
            <Field label="USD credit received" htmlFor="topup-usd" hint="Optional — defaults to the naira ÷ the current rate.">
              <Input id="topup-usd" inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value)} placeholder="30" />
            </Field>
            <Field label="Reference" htmlFor="topup-ref" hint="Optional — a receipt or transaction reference.">
              <Input id="topup-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
            {error ? (
              <p role="alert" className="flex items-start gap-2 text-sm text-danger">
                <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={busy} onClick={submit}>
                {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                {busy ? "Logging…" : "Log top-up"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
