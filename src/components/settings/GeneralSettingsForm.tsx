"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LuCircleAlert, LuLoaderCircle, LuLock, LuTriangleAlert } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/forms/Field";
import { FormActions } from "@/components/forms/FormActions";
import { FormSection } from "@/components/forms/FormSection";
import { generalSettingsSchema, splitEmailList, type GeneralSettingsInput } from "@/lib/validations/settings";
import type { GeneralSettings } from "@/lib/services/settings";
import { hqContactChanges, type HqContactChange } from "@/lib/hq-contact-rules";
import type { AlertRoleRecipient } from "@/lib/services/team-alerts";
import { computeEffective, type FxRateSnapshot } from "@/lib/fx-rate";

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
  // What the HQ contact is now, for the confirm-before-save preview; moves on with every save.
  const [baseline, setBaseline] = React.useState(settings);
  const [pending, setPending] = React.useState<{ data: GeneralSettingsInput; changes: HqContactChange[] } | null>(null);
  const [saving, setSaving] = React.useState(false);

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
      hqWhatsapp: settings.hqWhatsapp,
      hqTelegram: settings.hqTelegram,
      hqAddress: settings.hqAddress,
      bankName: settings.bankName,
      accountNumber: settings.accountNumber,
      accountName: settings.accountName,
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

  const save = async (data: GeneralSettingsInput) => {
    setSubmitError(null);
    setSaved(false);
    setSaving(true);
    // Only the founder changes the HQ contact, the alert inbox and the ₦/$ rate; anyone else here saves the bank details.
    const payload: GeneralSettingsInput = canEditPricing
      ? data
      : {
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
      // with the alert list as the server stores it: lower-case, comma-separated
      // and the Telegram name without its @.
      const stored: GeneralSettingsInput = {
        ...data,
        ...(data.alertEmails !== undefined ? { alertEmails: splitEmailList(data.alertEmails).join(", ") } : {}),
        ...(data.hqTelegram !== undefined ? { hqTelegram: data.hqTelegram.replace(/^@/, "") } : {}),
      };
      reset(stored);
      setBaseline((b) => ({ ...b, ...stored }) as GeneralSettings);
      setPending(null);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  // A contact change reaches every public page, ambassador link, receipt and
  // email footer the moment it is saved, so it is shown back first.
  const onSubmit = async (data: GeneralSettingsInput) => {
    const changes = canEditPricing ? hqContactChanges(baseline, data) : [];
    if (changes.length > 0) {
      setSubmitError(null);
      setPending({ data, changes });
      return;
    }
    await save(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-w-3xl space-y-12">
      <FormSection
        title="Company info"
        description={
          canEditPricing
            ? "The number, WhatsApp line and mailbox on every public page, in every ambassador link, on receipts and in every email footer. A change reaches all of them the moment it is saved."
            : "Only the founder (Super Admin) can change EduCraft's contact details."
        }
        action={!canEditPricing ? <LuLock className="size-4 text-muted-foreground" aria-label="Locked" /> : null}
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Company name" required htmlFor="companyName" error={errors.companyName?.message}>
            <Input id="companyName" disabled={!canEditPricing} {...register("companyName")} />
          </Field>
          <Field label="Contact phone" required htmlFor="companyPhone" error={errors.companyPhone?.message} hint="As people dial it, e.g. 0706 342 1088.">
            <Input id="companyPhone" inputMode="tel" disabled={!canEditPricing} {...register("companyPhone")} />
          </Field>
          <Field
            label="WhatsApp line"
            htmlFor="hqWhatsapp"
            error={errors.hqWhatsapp?.message}
            hint="What every ambassador link and 'message us' link opens. Leave blank to use the contact phone."
          >
            <Input id="hqWhatsapp" inputMode="tel" placeholder="Same as the contact phone" disabled={!canEditPricing} {...register("hqWhatsapp")} />
          </Field>
          <Field label="Contact email" required htmlFor="companyEmail" error={errors.companyEmail?.message}>
            <Input id="companyEmail" type="email" inputMode="email" disabled={!canEditPricing} {...register("companyEmail")} />
          </Field>
          <Field label="Telegram" htmlFor="hqTelegram" error={errors.hqTelegram?.message} hint="Username, with or without the @. Optional.">
            <Input id="hqTelegram" autoComplete="off" placeholder="@educraft" disabled={!canEditPricing} {...register("hqTelegram")} />
          </Field>
          <Field label="Address" htmlFor="hqAddress" error={errors.hqAddress?.message} hint="Shown in the site footer. Optional.">
            <Input id="hqAddress" disabled={!canEditPricing} {...register("hqAddress")} />
          </Field>
        </div>
      </FormSection>

      <Dialog open={pending != null} onOpenChange={(o) => { if (!o && !saving) setPending(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Change EduCraft&apos;s contact details?</DialogTitle>
            <DialogDescription>
              This updates every ambassador link, the site footer, receipts and every client, worker and ambassador email footer immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <ul className="space-y-2 text-sm">
              {(pending?.changes ?? []).map((c) => (
                <li key={c.field} className="flex flex-col gap-0.5">
                  <span className="meta-label">{c.label}</span>
                  <span className="break-words text-foreground">
                    <span className="text-muted-foreground">{c.before || "not set"}</span>
                    {" → "}
                    <span className="font-medium">{c.after || "not set"}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="flex items-start gap-2 rounded-xl bg-gold/10 px-3 py-2 text-[13px] text-gold">
              <LuTriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              Ambassadors have shared their links: the new WhatsApp line must be a live EduCraft number before you confirm.
            </p>
            {submitError ? (
              <p role="alert" className="flex items-start gap-2 text-sm text-danger">
                <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {submitError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" disabled={saving} onClick={() => setPending(null)}>
                Cancel
              </Button>
              <Button type="button" disabled={saving} onClick={() => pending && save(pending.data)}>
                {saving ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                {saving ? "Saving…" : "Confirm and save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
        title="Commission structure"
        description="Every rate — the worker share, the ambassador total and tier rates, the Core override, the executives' commissions, the buckets and pots, the founder draw tiers and the downpayment baseline — is published as a versioned structure."
      >
        <p className="text-sm text-muted-foreground">
          <Link href="/admin/settings/cashflow" className="text-primary hover:underline">
            Open EduCraft Cashflow
          </Link>
          {canEditPricing ? " to change it. A change becomes a new version; projects keep the version they were created under." : ". Only the founder (Super Admin) can publish a change."}
        </p>
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

      {submitError && pending == null ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {submitError}
        </p>
      ) : null}
      {saved && !isDirty ? <p className="text-sm text-success">Settings saved.</p> : null}

      <FormActions>
        <Button type="submit" disabled={isSubmitting || saving}>
          {isSubmitting || saving ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          {isSubmitting || saving ? "Saving…" : "Save settings"}
        </Button>
      </FormActions>
    </form>
  );
}
