"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/Field";
import { RoleChip } from "@/components/layout/RoleChip";
import { bankDetailsSchema, type BankDetailsInput } from "@/lib/validations/team";
import type { BankDetailsRow } from "@/lib/services/team";
import { formatDate } from "@/lib/utils";

/**
 * One executive's payout account. Fields carry the affordance — no outer
 * card. `editable` is false when the founder is looking at someone else's
 * details in read-only mode (never the case today, but the API enforces it).
 */
export function BankDetailsForm({ row, isSelf }: { row: BankDetailsRow; isSelf: boolean }) {
  const router = useRouter();
  const [state, setState] = React.useState<"idle" | "saved" | "error">("idle");
  const [message, setMessage] = React.useState<string | null>(null);
  const prefix = row.userId.slice(0, 6);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<BankDetailsInput>({
    resolver: zodResolver(bankDetailsSchema),
    defaultValues: {
      userId: row.userId,
      bankName: row.bankName ?? "",
      accountNumber: row.accountNumber ?? "",
      accountName: row.accountName ?? "",
    },
  });

  const onSubmit = async (data: BankDetailsInput) => {
    setState("idle");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/settings/bank", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not save the bank details.");
      }
      setState("saved");
      router.refresh();
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Could not save the bank details.");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-foreground">
          {row.fullName}
          {isSelf ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span> : null}
        </p>
        <RoleChip role={row.role} />
        <span className="text-[13px] text-muted-foreground">{row.title}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Bank" htmlFor={`${prefix}-bankName`} error={errors.bankName?.message}>
          <Input id={`${prefix}-bankName`} autoComplete="off" placeholder="e.g. GTBank" {...register("bankName")} />
        </Field>
        <Field label="Account number" htmlFor={`${prefix}-accountNumber`} error={errors.accountNumber?.message}>
          <Input
            id={`${prefix}-accountNumber`}
            inputMode="numeric"
            autoComplete="off"
            placeholder="10 digits"
            className="font-mono"
            {...register("accountNumber")}
          />
        </Field>
        <Field label="Account name" htmlFor={`${prefix}-accountName`} error={errors.accountName?.message}>
          <Input id={`${prefix}-accountName`} autoComplete="off" placeholder="As it appears at the bank" {...register("accountName")} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Save
        </Button>
        {state === "saved" && !isDirty ? (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <Check className="size-3.5" aria-hidden />
            Saved
          </span>
        ) : null}
        {state === "error" ? (
          <span className="inline-flex items-center gap-1 text-xs text-danger">
            <CircleAlert className="size-3.5" aria-hidden />
            {message}
          </span>
        ) : null}
        {row.updatedAt && state !== "saved" ? (
          <span className="text-xs text-muted-foreground">Last saved {formatDate(row.updatedAt)}</span>
        ) : null}
      </div>
    </form>
  );
}
