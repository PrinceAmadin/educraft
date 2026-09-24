"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuLoaderCircle, LuPlus } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/Field";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MANUAL_PAYMENT_METHODS } from "@/lib/finance/revenue-constants";

/**
 * Finance recording a bank transfer or cash payment that nobody marked first
 * (a client paid straight into the account). Marked and confirmed in one go.
 */
export function RecordPaymentDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [projectCode, setProjectCode] = React.useState("");
  const [leg, setLeg] = React.useState<"downpayment" | "balance">("downpayment");
  const [method, setMethod] = React.useState<string>("Bank transfer");
  const [reference, setReference] = React.useState("");
  const [date, setDate] = React.useState("");
  const [notes, setNotes] = React.useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/finance/revenue/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectCode: projectCode.trim(), leg, paymentMethod: method, reference: reference.trim(), date, notes: notes.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "That payment could not be recorded.");
      }
      setOpen(false);
      setProjectCode("");
      setReference("");
      setDate("");
      setNotes("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That payment could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <LuPlus className="size-4" aria-hidden />
        Record payment
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record a payment</DialogTitle>
            <DialogDescription>
              A transfer or cash payment that arrived without being marked. It is confirmed at once: the leg is verified and the buckets
              take EduCraft&apos;s share.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={submit}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Project ID" htmlFor="rp-code">
                <Input id="rp-code" value={projectCode} onChange={(e) => setProjectCode(e.target.value)} placeholder="EC-00012" autoCapitalize="characters" required />
              </Field>
              <Field label="Which payment" htmlFor="rp-leg">
                <Select id="rp-leg" value={leg} onChange={(e) => setLeg(e.target.value as "downpayment" | "balance")}>
                  <option value="downpayment">Downpayment (45%)</option>
                  <option value="balance">Balance (55%)</option>
                </Select>
              </Field>
              <Field label="Payment method" htmlFor="rp-method">
                <Select id="rp-method" value={method} onChange={(e) => setMethod(e.target.value)}>
                  {MANUAL_PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Payment date" htmlFor="rp-date">
                <Input id="rp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
            </div>
            <Field label="Reference" htmlFor="rp-ref">
              <Input id="rp-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transfer / receipt reference" />
            </Field>
            <Field label="Notes" htmlFor="rp-notes">
              <Textarea id="rp-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
              <Button type="submit" size="sm" disabled={busy || projectCode.trim().length < 3}>
                {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                Record and confirm
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
