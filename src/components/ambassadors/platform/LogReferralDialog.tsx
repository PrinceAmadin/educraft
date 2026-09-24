"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LuCircleAlert, LuLoaderCircle, LuUserPlus } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/Field";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { logReferralSchema, type LogReferralFormInput } from "@/lib/validations/ambassador-platform";

/**
 * "Log referral": the HOG records a student an ambassador brought in before
 * (or without) an order. It sits PENDING; when an order from that student
 * (same WhatsApp number, else same name) pays its downpayment it converts.
 */
export function LogReferralDialog({ ambassadorId, ambassadorName }: { ambassadorId: string; ambassadorName: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LogReferralFormInput>({ resolver: zodResolver(logReferralSchema), defaultValues: { clientName: "", clientWhatsapp: "", school: "", notes: "" } });

  const onSubmit = async (data: LogReferralFormInput) => {
    setSubmitError(null);
    try {
      const res = await fetch(`/api/admin/ambassadors/${ambassadorId}/referrals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not log the referral.");
      }
      reset();
      setOpen(false);
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not log the referral.");
    }
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <LuUserPlus className="size-4" aria-hidden />
        Log referral
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log a referral for {ambassadorName}</DialogTitle>
            <DialogDescription>A student they brought in. It counts as a conversion once that student&apos;s order pays its downpayment — matched by WhatsApp number, else by name.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <Field label="Student's name" htmlFor="lr-name" error={errors.clientName?.message} required>
              <Input id="lr-name" autoComplete="off" {...register("clientName")} />
            </Field>
            <Field label="WhatsApp number" htmlFor="lr-phone" error={errors.clientWhatsapp?.message} hint="Used to match their order automatically">
              <Input id="lr-phone" inputMode="tel" placeholder="0803 123 4567" {...register("clientWhatsapp")} />
            </Field>
            <Field label="School" htmlFor="lr-school" error={errors.school?.message}>
              <Input id="lr-school" {...register("school")} />
            </Field>
            <Field label="Note" htmlFor="lr-notes" error={errors.notes?.message}>
              <Textarea id="lr-notes" rows={2} maxLength={500} {...register("notes")} />
            </Field>
            {submitError ? (
              <p className="flex items-center gap-1.5 text-sm text-danger" role="alert">
                <LuCircleAlert className="size-4" aria-hidden />
                {submitError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                Save referral
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** On a PENDING referral the HOG logged (no order yet): mark it lost, or drop it. */
export function ReferralRowActions({ ambassadorId, referralId }: { ambassadorId: string; referralId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function set(status: "LOST" | "CANCELLED") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ambassadors/${ambassadorId}/referrals/${referralId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not update.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-elevated hover:text-foreground disabled:opacity-50" disabled={busy} onClick={() => set("LOST")}>
        Mark lost
      </button>
      <button type="button" className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-elevated hover:text-danger disabled:opacity-50" disabled={busy} onClick={() => set("CANCELLED")}>
        Remove
      </button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}
