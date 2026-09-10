"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/forms/Field";
import { ACADEMIC_LEVELS } from "@/lib/constants";
import {
  createAmbassadorSchema,
  type CreateAmbassadorInput,
} from "@/lib/validations/ambassadors";

export function NewAmbassadorForm({
  universities,
}: {
  universities: { id: string; name: string; abbreviation: string }[];
}) {
  const router = useRouter();
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
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
      const body = (await res.json().catch(() => null)) as
        | { id?: string; error?: string }
        | null;
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
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-foreground">Identity</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name" required htmlFor="fullName" error={errors.fullName?.message}>
            <Input id="fullName" autoComplete="off" {...register("fullName")} />
          </Field>
          <Field label="Phone" required htmlFor="phone" error={errors.phone?.message}>
            <Input id="phone" inputMode="tel" autoComplete="off" {...register("phone")} />
          </Field>
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" inputMode="email" autoComplete="off" {...register("email")} />
          </Field>
          <Field label="University" required htmlFor="universityId" error={errors.universityId?.message}>
            <Select id="universityId" {...register("universityId")}>
              <option value="">Select a university</option>
              {universities.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.abbreviation})
                </option>
              ))}
            </Select>
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
      </section>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-foreground">Bank details</h2>
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

      <p className="text-xs text-muted-foreground">
        A referral code, referral link, and ambassador ID are generated automatically. Tier starts at
        Bronze (10%).
      </p>

      {submitError ? (
        <p className="flex items-start gap-2 text-sm text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {submitError}
        </p>
      ) : null}

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {isSubmitting ? "Adding…" : "Add ambassador"}
        </Button>
      </div>
    </form>
  );
}
