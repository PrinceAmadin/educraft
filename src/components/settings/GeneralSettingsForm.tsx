"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/Field";
import { generalSettingsSchema, type GeneralSettingsInput } from "@/lib/validations/settings";
import type { GeneralSettings } from "@/lib/services/settings";

const TIERS = ["BRONZE", "SILVER", "GOLD", "PLATINUM"] as const;
const TIER_LABEL: Record<(typeof TIERS)[number], string> = {
  BRONZE: "Bronze",
  SILVER: "Silver",
  GOLD: "Gold",
  PLATINUM: "Platinum",
};

export function GeneralSettingsForm({
  settings,
  canEditPricing,
}: {
  settings: GeneralSettings;
  canEditPricing: boolean;
}) {
  const router = useRouter();
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<GeneralSettingsInput>({
    resolver: zodResolver(generalSettingsSchema),
    defaultValues: {
      companyName: settings.companyName,
      companyPhone: settings.companyPhone,
      companyEmail: settings.companyEmail,
      bankName: settings.bankName,
      accountNumber: settings.accountNumber,
      accountName: settings.accountName,
      downpaymentPercentage: settings.downpaymentPercentage,
      commissionRates: settings.commissionRates,
    },
  });

  const onSubmit = async (data: GeneralSettingsInput) => {
    setSubmitError(null);
    setSaved(false);
    const payload: GeneralSettingsInput = canEditPricing
      ? data
      : {
          companyName: data.companyName,
          companyPhone: data.companyPhone,
          companyEmail: data.companyEmail,
          bankName: data.bankName,
          accountNumber: data.accountNumber,
          accountName: data.accountName,
        };
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not save settings.");
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not save settings.");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-foreground">Company info</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Shown to clients on the intake confirmation and tracker.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Company name" required htmlFor="companyName" error={errors.companyName?.message}>
            <Input id="companyName" {...register("companyName")} />
          </Field>
          <Field label="Contact phone" required htmlFor="companyPhone" error={errors.companyPhone?.message}>
            <Input id="companyPhone" inputMode="tel" {...register("companyPhone")} />
          </Field>
          <Field label="Contact email" required htmlFor="companyEmail" error={errors.companyEmail?.message}>
            <Input id="companyEmail" type="email" inputMode="email" {...register("companyEmail")} />
          </Field>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-foreground">Bank details</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Shown to clients as payment instructions after intake. Leave blank to send bank details on
          WhatsApp instead.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Bank name" htmlFor="bankName" error={errors.bankName?.message}>
            <Input id="bankName" {...register("bankName")} />
          </Field>
          <Field label="Account number" htmlFor="accountNumber" error={errors.accountNumber?.message}>
            <Input id="accountNumber" inputMode="numeric" {...register("accountNumber")} />
          </Field>
          <Field label="Account name" htmlFor="accountName" error={errors.accountName?.message}>
            <Input id="accountName" {...register("accountName")} />
          </Field>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Pricing defaults</h2>
          {!canEditPricing ? <Lock className="size-3.5 text-muted-foreground" aria-hidden /> : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {canEditPricing
            ? "The downpayment default pre-fills new services — each service can still override it. Commission rates apply to every ambassador immediately."
            : "Only the founder (Super Admin) can change pricing and commission rates."}
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Default downpayment %"
            htmlFor="downpaymentPercentage"
            error={errors.downpaymentPercentage?.message}
          >
            <Input
              id="downpaymentPercentage"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              disabled={!canEditPricing}
              {...register("downpaymentPercentage")}
            />
          </Field>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {TIERS.map((tier) => (
            <Field key={tier} label={`${TIER_LABEL[tier]} %`} htmlFor={`rate-${tier}`}>
              <Input
                id={`rate-${tier}`}
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                disabled={!canEditPricing}
                {...register(`commissionRates.${tier}`)}
              />
            </Field>
          ))}
        </div>
      </section>

      {submitError ? (
        <p className="flex items-start gap-2 text-sm text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {submitError}
        </p>
      ) : null}
      {saved && !isDirty ? <p className="text-sm text-success">Settings saved.</p> : null}

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {isSubmitting ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
