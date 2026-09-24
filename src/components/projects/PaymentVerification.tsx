"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCheck, LuClock, LuCircleAlert, LuLoaderCircle as Loader2 } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/Field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn, formatDate, formatNaira } from "@/lib/utils";

type Leg = "downpayment" | "balance";

const METHODS = ["Bank transfer", "Cash", "POS", "USSD", "Card", "Other"];

export function PaymentVerification({
  projectCode,
  leg,
  label,
  amount,
  status,
  date,
  canVerify = true,
}: {
  projectCode: string;
  leg: Leg;
  label: string;
  amount: number;
  status: string;
  date: Date | string | null;
  /** Verifying is a finance act (founder, CFO). Everyone else marks paid and waits. */
  canVerify?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [method, setMethod] = React.useState("Bank transfer");
  const [reference, setReference] = React.useState("");
  const [paidDate, setPaidDate] = React.useState("");
  const [notes, setNotes] = React.useState("");

  async function call(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${projectCode}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "That action could not be completed.");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zone px-4 py-3.5">
      <div>
        <p className="text-sm font-medium text-foreground">
          {label}
          <span className="ml-2 font-mono text-xs text-muted-foreground">{formatNaira(amount)}</span>
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-xs">
          {status === "Verified" ? (
            <span className="inline-flex items-center gap-1 text-success">
              <LuCheck className="size-3.5" aria-hidden />
              Verified{date ? ` · ${formatDate(date)}` : ""}
            </span>
          ) : status === "Paid" ? (
            <span className="inline-flex items-center gap-1 text-gold">
              <LuClock className="size-3.5" aria-hidden />
              Paid — awaiting verification
            </span>
          ) : (
            <span className="text-muted-foreground">Unpaid</span>
          )}
        </p>
      </div>

      <div className="flex gap-2">
        {status === "Unpaid" ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => call("mark-payment", { leg })}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Mark as paid
          </Button>
        ) : null}
        {status === "Paid" && canVerify ? (
          <Button size="sm" onClick={() => setOpen(true)}>
            Verify payment
          </Button>
        ) : status === "Paid" ? (
          <span className="text-xs text-muted-foreground">Finance confirms it from the Revenue Tracker</span>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify {label.toLowerCase()}</DialogTitle>
            <DialogDescription>
              Records a confirmed payment of {formatNaira(amount)} and marks this leg verified.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              call("verify-payment", {
                leg,
                paymentMethod: method,
                reference: reference.trim(),
                date: paidDate,
                notes: notes.trim(),
              });
            }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Payment method" htmlFor="pv-method">
                <Select id="pv-method" value={method} onChange={(e) => setMethod(e.target.value)}>
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Payment date" htmlFor="pv-date">
                <Input id="pv-date" type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
              </Field>
            </div>
            <Field label="Reference number" htmlFor="pv-ref">
              <Input id="pv-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transfer / receipt reference" />
            </Field>
            <Field label="Notes" htmlFor="pv-notes">
              <Textarea id="pv-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Confirm verification
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {error && !open ? (
        <p className={cn("w-full text-xs text-danger")}>{error}</p>
      ) : null}
    </div>
  );
}
