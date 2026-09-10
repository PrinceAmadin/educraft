"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/Field";
import { TagInput } from "@/components/forms/TagInput";
import { createWorkerSchema, type CreateWorkerInput } from "@/lib/validations/workers";
import { COMMON_SKILLS, COMMON_SPECIALTIES } from "@/lib/constants";

export function NewWorkerForm() {
  const router = useRouter();
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateWorkerInput>({
    resolver: zodResolver(createWorkerSchema),
    mode: "onBlur",
    defaultValues: {
      fullName: "",
      phone: "",
      email: "",
      educationLevel: "",
      specialties: [],
      skills: [],
      maxConcurrentProjects: 3,
      bankName: "",
      accountNumber: "",
      accountName: "",
      notes: "",
    },
  });

  const onSubmit = async (data: CreateWorkerInput) => {
    setSubmitError(null);
    try {
      const res = await fetch("/api/admin/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = (await res.json().catch(() => null)) as
        | { id?: string; error?: string }
        | null;
      if (!res.ok || !body?.id) {
        throw new Error(body?.error ?? "Could not add the worker.");
      }
      router.push(`/admin/workers/${body.id}`);
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not add the worker.");
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
          <Field label="Education level" htmlFor="educationLevel" error={errors.educationLevel?.message}>
            <Input id="educationLevel" placeholder="e.g. BSc, MSc" {...register("educationLevel")} />
          </Field>
          <Field
            label="Max concurrent projects"
            htmlFor="maxConcurrentProjects"
            error={errors.maxConcurrentProjects?.message as string | undefined}
          >
            <Input
              id="maxConcurrentProjects"
              type="number"
              inputMode="numeric"
              min={1}
              max={20}
              {...register("maxConcurrentProjects")}
            />
          </Field>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-foreground">Specialties &amp; skills</h2>
        <div className="mt-4 space-y-5">
          <Field
            label="Specialties (departments)"
            htmlFor="specialties"
            error={errors.specialties?.message as string | undefined}
            hint="Departments this worker can handle"
          >
            <Controller
              control={control}
              name="specialties"
              render={({ field }) => (
                <TagInput
                  id="specialties"
                  value={field.value ?? []}
                  onChange={field.onChange}
                  placeholder="Type a department and press Enter"
                  suggestions={[...COMMON_SPECIALTIES]}
                />
              )}
            />
          </Field>
          <Field
            label="Skills"
            htmlFor="skills"
            error={errors.skills?.message as string | undefined}
            hint="Tools and techniques — SPSS, MATLAB, AutoCAD…"
          >
            <Controller
              control={control}
              name="skills"
              render={({ field }) => (
                <TagInput
                  id="skills"
                  value={field.value ?? []}
                  onChange={field.onChange}
                  placeholder="Type a skill and press Enter"
                  suggestions={[...COMMON_SKILLS]}
                />
              )}
            />
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

      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <Field label="Notes" htmlFor="notes" error={errors.notes?.message}>
          <textarea
            id="notes"
            rows={3}
            className="w-full rounded-lg border border-border bg-input p-3 text-sm text-foreground placeholder:text-subtle focus-visible:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            {...register("notes")}
          />
        </Field>
      </section>

      {submitError ? (
        <p className="flex items-start gap-2 text-sm text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {submitError}
        </p>
      ) : null}

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {isSubmitting ? "Adding…" : "Add worker"}
        </Button>
      </div>
    </form>
  );
}
