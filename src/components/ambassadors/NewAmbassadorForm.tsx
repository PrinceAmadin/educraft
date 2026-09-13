"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LuCircleAlert, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/forms/Field";
import { FormActions } from "@/components/forms/FormActions";
import { FormSection } from "@/components/forms/FormSection";
import { UniversityCombobox, type UniversityOption } from "@/components/forms/UniversityCombobox";
import { ACADEMIC_LEVELS } from "@/lib/constants";
import { createAmbassadorSchema, type CreateAmbassadorInput } from "@/lib/validations/ambassadors";

export function NewAmbassadorForm({ universities }: { universities: UniversityOption[] }) {
  const router = useRouter();
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateAmbassadorInput>({
    resolver: zodResolver(createAmbassadorSchema),
    mode: "onBlur",
    defaultValues: {
      fullName: "",
      phone: "",
      email: "",
      universityId: "",
      department: "",
      level: "",
      bankName: "",
      accountNumber: "",
      accountName: "",
    },
  });

  const onSubmit = async (data: CreateAmbassadorInput) => {
    setSubmitError(null);
    try {
      const res = await fetch("/api/admin/ambassadors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !body?.id) {
        throw new Error(body?.error ?? "Could not add the ambassador.");
      }
      router.push(`/admin/ambassadors/${body.id}`);
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not add the ambassador.");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-w-3xl space-y-12">
      <FormSection title="Identity">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Full name" required htmlFor="fullName" error={errors.fullName?.message}>
            <Input id="fullName" autoComplete="off" {...register("fullName")} />
          </Field>
          <Field label="Phone" required htmlFor="phone" error={errors.phone?.message}>
            <Input id="phone" inputMode="tel" autoComplete="off" {...register("phone")} />
          </Field>
          <Field label="Email" htmlFor="email" error={errors.email?.message} className="sm:col-span-2">
            <Input id="email" type="email" inputMode="email" autoComplete="off" {...register("email")} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Campus">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="University"
            required
            htmlFor="universityId"
            error={errors.universityId?.message}
            className="sm:col-span-2"
          >
            <Controller
              control={control}
              name="universityId"
              render={({ field }) => (
                <UniversityCombobox
                  id="universityId"
                  universities={universities}
                  value={field.value ?? ""}
                  onChange={(v) => field.onChange(v)}
                  onBlur={field.onBlur}
                  allowOther={false}
                  invalid={!!errors.universityId}
                />
              )}
            />
          </Field>
          <Field label="Department" htmlFor="department" error={errors.department?.message}>
            <Input id="department" {...register("department")} />
          </Field>
          <Field label="Level" htmlFor="level" error={errors.level?.message}>
            <Select id="level" {...register("level")}>
              <option value="">Not specified</option>
              {ACADEMIC_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </FormSection>

      <FormSection title="Bank details" description="Where commission is paid.">
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

      <p className="text-[13px] text-muted-foreground">
        A referral code, referral link and ambassador ID are generated automatically. Tier starts at
        Bronze (10%).
      </p>

      {submitError ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {submitError}
        </p>
      ) : null}

      <FormActions>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          {isSubmitting ? "Adding…" : "Add ambassador"}
        </Button>
      </FormActions>
    </form>
  );
}
