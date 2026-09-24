"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuLoaderCircle, LuPlus } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/Field";
import { FINANCE_DEFAULTS } from "@/lib/finance/commission-config";
import { formatNaira } from "@/lib/utils";

/**
 * The HOG logs a student-union sponsorship from the Growth Fund. Up to the
 * threshold it is logged at once; above it, it waits for the founder.
 */
export function SponsorshipForm({ isFounder }: { isFounder: boolean }) {
  const router = useRouter();
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const needsApproval = !isFounder && Number(amount) > FINANCE_DEFAULTS.expenseApprovalThreshold;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/admin/finance/expenses/sponsorship", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim(), amount: Number(amount), date, notes: notes.trim() }),
      });
      const body = (await res.json().catch(() => null)) as { approvalStatus?: string; budget?: { remaining: number }; error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "The sponsorship could not be logged.");
      setDone(
        body?.approvalStatus === "PENDING_APPROVAL"
          ? `Sent to the founder for approval. ${formatNaira(Math.max(0, body.budget?.remaining ?? 0))} of the quarter's budget remains once approved.`
          : `Logged. ${formatNaira(Math.max(0, body?.budget?.remaining ?? 0))} of the quarter's budget remains.`
      );
      setDescription("");
      setAmount("");
      setNotes("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The sponsorship could not be logged.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={submit}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_11rem]">
        <Field label="Who was sponsored" required htmlFor="sp-desc">
          <Input id="sp-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="UNILAG Dept. of Engineering dinner" required />
        </Field>
        <Field label="Amount (₦)" required htmlFor="sp-amount" hint={needsApproval ? `Over ${formatNaira(FINANCE_DEFAULTS.expenseApprovalThreshold)}: needs the founder` : undefined}>
          <Input id="sp-amount" type="number" inputMode="numeric" min={0} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
        <Field label="Date" required htmlFor="sp-date">
          <Input id="sp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
      </div>
      <Field label="Notes" htmlFor="sp-notes">
        <Textarea id="sp-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What EduCraft got for it (optional)" />
      </Field>
      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
      {done ? <p className="text-sm text-success">{done}</p> : null}
      <Button type="submit" size="sm" disabled={busy || description.trim().length < 3 || !(Number(amount) > 0)}>
        {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuPlus className="size-4" aria-hidden />}
        {needsApproval ? "Send for approval" : "Log sponsorship"}
      </Button>
    </form>
  );
}
