"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuLoaderCircle, LuSlidersHorizontal } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/Field";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BUCKET_META, BUCKET_TYPES } from "@/lib/finance/commission-config";

/** The CFO's manual correction to a bucket — rare, signed, always with a reason, always in the log. */
export function ManualAdjustmentDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [bucket, setBucket] = React.useState<string>(BUCKET_TYPES[0]);
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/finance/buckets/manual-adjustment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket, amount: Number(amount), reason: reason.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "The adjustment could not be saved.");
      }
      setOpen(false);
      setAmount("");
      setReason("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The adjustment could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <LuSlidersHorizontal className="size-4" aria-hidden />
        Manual adjustment
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust a bucket</DialogTitle>
            <DialogDescription>
              A correction by hand. Use a negative amount to take money out. It is written to the transaction log with your name and reason.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={submit}>
            <Field label="Bucket" htmlFor="ma-bucket">
              <Select id="ma-bucket" value={bucket} onChange={(e) => setBucket(e.target.value)}>
                {BUCKET_TYPES.map((b) => (
                  <option key={b} value={b}>
                    {BUCKET_META[b].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount (naira, negative to remove)" htmlFor="ma-amount">
              <Input id="ma-amount" type="number" inputMode="numeric" step={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="-5000" required />
            </Field>
            <Field label="Reason" htmlFor="ma-reason">
              <Textarea id="ma-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Bank charge not captured as an expense…" required />
            </Field>
            {error ? (
              <p className="flex items-start gap-2 text-sm text-danger">
                <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy || amount.trim() === "" || Number(amount) === 0 || reason.trim().length < 3}>
                {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                Save adjustment
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
