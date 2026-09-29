"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LuCircleAlert, LuLoaderCircle, LuLock } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/Field";
import { FormActions } from "@/components/forms/FormActions";
import { FormSection } from "@/components/forms/FormSection";
import { generalSettingsSchema, splitEmailList, type GeneralSettingsInput } from "@/lib/validations/settings";
import type { GeneralSettings } from "@/lib/services/settings";
import type { AlertRoleRecipient } from "@/lib/services/team-alerts";
import { computeEffective, type FxRateSnapshot } from "@/lib/fx-rate";

const TIERS = ["BRONZE", "SILVER", "GOLD", "PLATINUM"] as const;

const NAIRA = new Intl.NumberFormat("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatWhen(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "never";
  const mins = Math.round((Date.now() - then) / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}
const TIER_LABEL: Record<(typeof TIERS)[number], string> = {
  BRONZE: "Bronze",
  SILVER: "Silver",
  GOLD: "Gold",
  PLATINUM: "Platinum",
};

export function GeneralSettingsForm({
  settings,
  canEditPricing,
  alertRoles,
}: {
  settings: GeneralSettings;
  canEditPricing: boolean;
  /** The executives who also get alerts, at their sign-in email. */
  alertRoles: AlertRoleRecipient[];
}) {
  const router = useRouter();
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
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
      parentCommissionRate: settings.parentCommissionRate,
      alertEmails: settings.alertEmails,
      fxRateMarginPercent: settings.fxRateMarginPercent,
      fxRateManualOverride: settings.fxRateManualOverride,
    },
  });

  // FX rate section — live snapshot of the auto value and "Refresh now" state.
  const [fxSnapshot, setFxSnapshot] = React.useState<FxRateSnapshot>(settings.fxRateSnapshot);
  const [refreshing, setRefreshing] = React.useState(false);
  const [refreshError, setRefreshError] = React.useState<string | null>(null);
  const watchedMargin = watch("fxRateMarginPercent");
  const watchedOverride = watch("fxRateManualOverride");

  const previewBase = (() => {
    const overrideRaw = typeof watchedOverride === "string" ? watchedOverride.trim() : "";
    if (overrideRaw !== "") {
      const n = Number(overrideRaw);
      if (Number.isFinite(n) && n > 0) return { value: n, source: "manual" as const };
    }
    return { value: fxSnapshot.baseRate, source: fxSnapshot.source };
  })();
  const marginForPreview = (() => {
    const raw = Number(watchedMargin);
    if (Number.isFinite(raw)) return raw;
    return settings.fxRateMarginPercent;
  })();
  const previewEffective = computeEffective(previewBase.value, marginForPreview);

  const onRefreshFx = React.useCallback(async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const res = await fetch("/api/admin/settings/fx-rate/refresh", { method: "POST" });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; reason?: string; snapshot?: FxRateSnapshot } | null;
      if (!res.ok) throw new Error(body?.reason ?? "Could not refresh");
      if (body?.snapshot) setFxSnapshot(body.snapshot);
      if (body?.ok === false) setRefreshError(body.reason ?? "The FX source didn't answer.");
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : "Could not refresh");
    } finally {
      setRefreshing(false);
    }
  }, []);

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
      // What was saved becomes the new baseline (so "Settings saved." shows),
      // with the alert list as the server stores it: lower-case, comma-separated.
      reset({
        ...data,
        ...(data.alertEmails !== undefined ? { alertEmails: splitEmailList(data.alertEmails).join(", ") } : {}),
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not save settings.");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-w-3xl space-y-12">
      <FormSection title="Company info" description="Shown to clients on the intake confirmation and tracker.">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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
      </FormSection>

      <FormSection
        title="Bank details"
        description="Shown to clients as payment instructions after intake. Leave blank to send bank details on WhatsApp instead."
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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
      </FormSection>

      <FormSection
        title="Pricing defaults"
        description={
          canEditPricing
            ? "The downpayment default pre-fills new services — each service can still override it. Commission rates apply to every ambassador immediately."
            : "Only the founder (Super Admin) can change pricing and commission rates."
        }
        action={!canEditPricing ? <LuLock className="size-4 text-muted-foreground" aria-label="Locked" /> : null}
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
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
      </FormSection>

      <FormSection
        title="Parent ambassadors"
        description={
          canEditPricing
            ? "What a parent (Core) ambassador earns from a sub-ambassador's job, by default. Set a different rate for one pair from that sub-ambassador's page."
            : "Only the founder (Super Admin) can change this rate."
        }
        action={!canEditPricing ? <LuLock className="size-4 text-muted-foreground" aria-label="Locked" /> : null}
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Default parent commission %"
            htmlFor="parentCommissionRate"
            error={errors.parentCommissionRate?.message}
          >
            <Input
              id="parentCommissionRate"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              disabled={!canEditPricing}
              {...register("parentCommissionRate")}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="AI cost — ₦/$ rate"
        description={
          canEditPricing
            ? "The rate HQ uses to convert Claude's US-dollar costs to naira. Anthropic marks the market rate up by ~2–3 % on top-up, so a small margin keeps our figures honest. Old AI usage rows are frozen at the rate they were logged with."
            : "Only the founder (Super Admin) can change the ₦/$ rate used for AI cost conversion."
        }
        action={!canEditPricing ? <LuLock className="size-4 text-muted-foreground" aria-label="Locked" /> : null}
      >
        <div className="space-y-2 rounded-xl bg-zone px-4 py-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="min-w-0">
              <p className="meta-label">Auto-fetched base</p>
              <p className="mt-1 font-mono text-foreground">
                ₦{NAIRA.format(fxSnapshot.baseRate)}
                <span className="ml-2 font-normal text-muted-foreground">
                  {fxSnapshot.source === "auto"
                    ? `from ${fxSnapshot.autoSource ?? "FX API"} · fetched ${formatWhen(fxSnapshot.fetchedAt)}`
                    : fxSnapshot.source === "manual"
                      ? "manual override in effect"
                      : fxSnapshot.source === "env"
                        ? "from USD_NGN_RATE env"
                        : "default (nothing fetched yet)"}
                </span>
              </p>
            </div>
            {canEditPricing ? (
              <Button type="button" variant="outline" size="sm" onClick={onRefreshFx} disabled={refreshing}>
                {refreshing ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                {refreshing ? "Refreshing…" : "Refresh now"}
              </Button>
            ) : null}
          </div>
          {refreshError ? (
            <p role="alert" className="flex items-start gap-2 text-danger">
              <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {refreshError}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Margin %"
            htmlFor="fxRateMarginPercent"
            error={errors.fxRateMarginPercent?.message}
            hint="Anthropic charges roughly 2–3 % above the market rate — this covers the gap."
          >
            <Input
              id="fxRateMarginPercent"
              type="number"
              inputMode="decimal"
              min={0}
              max={20}
              step={0.1}
              disabled={!canEditPricing}
              {...register("fxRateMarginPercent")}
            />
          </Field>
          <Field
            label="Manual override (₦/$)"
            htmlFor="fxRateManualOverride"
            error={errors.fxRateManualOverride?.message}
            hint="Leave empty to use the auto rate. A value here replaces the auto value; the margin still applies."
          >
            <Input
              id="fxRateManualOverride"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.01}
              placeholder="e.g. 1352"
              disabled={!canEditPricing}
              {...register("fxRateManualOverride")}
            />
          </Field>
        </div>

        <p className="rounded-xl bg-zone px-4 py-3 text-sm text-muted-foreground">
          Effective rate ={" "}
          <span className="font-mono text-foreground">₦{NAIRA.format(previewBase.value)}</span>
          {" × (1 + "}
          <span className="font-mono text-foreground">{Number.isFinite(marginForPreview) ? marginForPreview : 0}%</span>
          {") = "}
          <span className="font-mono text-foreground">₦{NAIRA.format(previewEffective)}</span> per $
          {previewBase.source === "manual" ? " (manual override)" : null}
        </p>
      </FormSection>

      <FormSection
        title="Email alerts"
        description={
          canEditPricing
            ? "Emailed the moment an ambassador or worker applies, and when a client's downpayment on an order comes in through Paystack."
            : "Only the founder (Super Admin) can change where alerts go."
        }
        action={!canEditPricing ? <LuLock className="size-4 text-muted-foreground" aria-label="Locked" /> : null}
      >
        <Field
          label="Founder's inbox (every alert)"
          required
          htmlFor="alertEmails"
          error={errors.alertEmails?.message}
          hint="Separate several addresses with commas. Use an inbox other than educraft611@gmail.com: that account sends the alerts, and Gmail files mail it sends to itself under Sent."
        >
          <Input
            id="alertEmails"
            inputMode="email"
            autoComplete="off"
            disabled={!canEditPricing}
            {...register("alertEmails")}
          />
        </Field>

        <div className="space-y-3">
          <p className="meta-label">Also sent to</p>
          <ul className="space-y-3">
            {alertRoles.map((r) => (
              <li key={r.audience} className="text-sm">
                <p className="text-foreground">
                  <span className="font-medium">{r.role}</span>
                  <span className="text-muted-foreground"> · {r.covers}</span>
                </p>
                {r.people.length > 0 ? (
                  r.people.map((p) => (
                    <p key={p.email} className="break-words text-muted-foreground">
                      {p.name}, {p.email}
                    </p>
                  ))
                ) : (
                  <p className="text-muted-foreground">No active {r.role}, so only the founder gets these.</p>
                )}
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-muted-foreground">
            Executives get alerts at the email they sign in with.{" "}
            <Link href="/admin/settings/team" className="text-primary hover:underline">
              Change it on Team &amp; roles
            </Link>
            .
          </p>
        </div>
      </FormSection>

      {submitError ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {submitError}
        </p>
      ) : null}
      {saved && !isDirty ? <p className="text-sm text-success">Settings saved.</p> : null}

      <FormActions>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          {isSubmitting ? "Saving…" : "Save settings"}
        </Button>
      </FormActions>
    </form>
  );
}
