"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LuCircleAlert, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/Field";
import { FINANCE_DEFAULTS } from "@/lib/finance/commission-config";
import { createPartnershipSchema, type CreatePartnershipInput } from "@/lib/validations/ambassador-platform";
import { formatNaira } from "@/lib/utils";

export interface SchoolOption {
  abbreviation: string;
  name: string;
}

export interface PartnershipFormValues {
  organisationName: string;
  school: string;
  faculty: string;
  contactPerson: string;
  contactWhatsapp: string;
  commitmentAmount: number;
  whatWeReceive: "" | "GROUP_ACCESS" | "PHYSICAL_ACCESS" | "BOTH";
  status: "ACTIVE" | "IN_NEGOTIATION" | "INACTIVE";
  startDate: string;
  renewalDate: string;
  notes: string;
}

export const EMPTY_PARTNERSHIP: PartnershipFormValues = { organisationName: "", school: "", faculty: "", contactPerson: "", contactWhatsapp: "", commitmentAmount: 0, whatWeReceive: "", status: "ACTIVE", startDate: "", renewalDate: "", notes: "" };

/**
 * The partnership fields (spec: New Partnership). Used by "Add partnership"
 * and by Edit inside the detail view. The commitment is paid from the Growth
 * Fund: over the ₦50,000 limit it waits for the founder unless the founder
 * logs it.
 */
export function PartnershipForm({ initial, schools, isFounder, submitLabel, allowInactive, onSubmit, onCancel }: { initial: PartnershipFormValues; schools: SchoolOption[]; isFounder: boolean; submitLabel: string; allowInactive?: boolean; onSubmit: (values: CreatePartnershipInput) => Promise<string | null>; onCancel: () => void }) {
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreatePartnershipInput>({ resolver: zodResolver(createPartnershipSchema), defaultValues: initial });
  const amount = Number(watch("commitmentAmount") ?? 0);
  const status = watch("status");
  const threshold = FINANCE_DEFAULTS.expenseApprovalThreshold;
  const hint =
    status !== "ACTIVE"
      ? "Nothing is paid until the partnership is active."
      : amount > threshold && !isFounder
        ? `Over ${formatNaira(threshold)}: logged from the Growth Fund but waits for the founder's approval.`
        : amount > 0
          ? "Logged from the Growth Fund when you save."
          : undefined;

  return (
    <form
      noValidate
      className="max-h-[70vh] space-y-4 overflow-y-auto pr-1"
      onSubmit={handleSubmit(async (values) => {
        setSubmitError(null);
        const error = await onSubmit(values);
        if (error) setSubmitError(error);
      })}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Organisation name" htmlFor="pf-org" error={errors.organisationName?.message} required className="sm:col-span-2">
          <Input id="pf-org" autoComplete="off" placeholder="e.g. UNILAG Engineering Students' Association" {...register("organisationName")} />
        </Field>
        <Field label="School / university" htmlFor="pf-school" error={errors.school?.message} required>
          <Input id="pf-school" list="pf-schools" autoComplete="off" {...register("school")} />
          <datalist id="pf-schools">
            {schools.map((s) => (
              <option key={s.abbreviation} value={s.abbreviation}>
                {s.name}
              </option>
            ))}
          </datalist>
        </Field>
        <Field label="Faculty / department" htmlFor="pf-faculty" error={errors.faculty?.message} hint="Or University-wide">
          <Input id="pf-faculty" {...register("faculty")} />
        </Field>
        <Field label="Contact person" htmlFor="pf-contact" error={errors.contactPerson?.message}>
          <Input id="pf-contact" {...register("contactPerson")} />
        </Field>
        <Field label="Contact WhatsApp" htmlFor="pf-wa" error={errors.contactWhatsapp?.message}>
          <Input id="pf-wa" inputMode="tel" placeholder="0803 123 4567" {...register("contactWhatsapp")} />
        </Field>
        <Field label="Status" htmlFor="pf-status" error={errors.status?.message}>
          <Select id="pf-status" {...register("status")}>
            <option value="ACTIVE">Active</option>
            <option value="IN_NEGOTIATION">In negotiation</option>
            {allowInactive ? <option value="INACTIVE">Inactive (ended)</option> : null}
          </Select>
        </Field>
        <Field label="Commitment amount (₦)" htmlFor="pf-amount" error={errors.commitmentAmount?.message} hint={hint}>
          <Input id="pf-amount" type="number" inputMode="numeric" min={0} step={1000} {...register("commitmentAmount")} />
        </Field>
        <Field label="What we receive" htmlFor="pf-receive" error={errors.whatWeReceive?.message} className="sm:col-span-2">
          <Select id="pf-receive" {...register("whatWeReceive")}>
            <option value="">Not agreed yet</option>
            <option value="GROUP_ACCESS">Access to announce in their group</option>
            <option value="PHYSICAL_ACCESS">Physical access (stands, visits)</option>
            <option value="BOTH">Both</option>
          </Select>
        </Field>
        <Field label="Start date" htmlFor="pf-start" error={errors.startDate?.message}>
          <Input id="pf-start" type="date" {...register("startDate")} />
        </Field>
        <Field label="Renewal date" htmlFor="pf-renew" error={errors.renewalDate?.message} hint="It shows on the dashboard 30 days before">
          <Input id="pf-renew" type="date" {...register("renewalDate")} />
        </Field>
        <Field label="Notes" htmlFor="pf-notes" error={errors.notes?.message} className="sm:col-span-2">
          <Textarea id="pf-notes" rows={3} maxLength={2000} placeholder="How the relationship is going, what they asked for…" {...register("notes")} />
        </Field>
      </div>
      {submitError ? (
        <p className="flex items-center gap-1.5 text-sm text-danger" role="alert">
          <LuCircleAlert className="size-4" aria-hidden />
          {submitError}
        </p>
      ) : null}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** Tells the HOG what happened to the money after a save. */
export function expenseOutcome(expense: { approvalStatus: string } | null | undefined): string | null {
  if (!expense) return null;
  return expense.approvalStatus === "PENDING_APPROVAL" ? "The commitment is logged from the Growth Fund and waits for the founder's approval." : "The commitment is logged from the Growth Fund.";
}
