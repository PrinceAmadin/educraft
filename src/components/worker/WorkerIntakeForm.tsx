"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LuCheck, LuCircleAlert, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/Field";
import { TagInput } from "@/components/forms/TagInput";
import { COMMON_SKILLS, COMMON_SPECIALTIES } from "@/lib/constants";
import { selfUpdateWorkerSchema, type SelfUpdateWorkerInput } from "@/lib/validations/workers";

/**
 * A worker editing their own contact/education/specialty info. Only ever
 * PATCHes /api/worker/profile, which resolves the caller's own workerId
 * server-side — there is no id in this form for a worker to tamper with.
 */
export function WorkerIntakeForm({
  initial,
}: {
  initial: { phone: string; email: string | null; educationLevel: string | null; specialties: string[]; skills: string[] };
}) {
  const router = useRouter();
  const [state, setState] = React.useState<"idle" | "saved" | "error">("idle");
  const [message, setMessage] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<SelfUpdateWorkerInput>({
    resolver: zodResolver(selfUpdateWorkerSchema),
    defaultValues: {
      phone: initial.phone,
      email: initial.email ?? "",
      educationLevel: initial.educationLevel ?? "",
      specialties: initial.specialties,
      skills: initial.skills,
    },
  });

  const onSubmit = async (data: SelfUpdateWorkerInput) => {
    setState("idle");
    setMessage(null);
    try {
      const res = await fetch("/api/worker/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not save.");
      }
      setState("saved");
      router.refresh();
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Could not save.");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Phone" htmlFor="wi-phone" error={errors.phone?.message}>
          <Input id="wi-phone" inputMode="tel" {...register("phone")} />
        </Field>
        <Field label="Email" htmlFor="wi-email" error={errors.email?.message}>
          <Input id="wi-email" type="email" {...register("email")} />
        </Field>
        <Field label="Education" htmlFor="wi-edu" error={errors.educationLevel?.message}>
          <Input id="wi-edu" {...register("educationLevel")} />
        </Field>
      </div>

      <Field label="Specialties" htmlFor="wi-specialties" error={errors.specialties?.message as string | undefined}>
        <Controller
          control={control}
          name="specialties"
          render={({ field }) => (
            <TagInput id="wi-specialties" value={field.value ?? []} onChange={field.onChange} suggestions={[...COMMON_SPECIALTIES]} />
          )}
        />
      </Field>
      <Field label="Skills" htmlFor="wi-skills" error={errors.skills?.message as string | undefined}>
        <Controller
          control={control}
          name="skills"
          render={({ field }) => (
            <TagInput id="wi-skills" value={field.value ?? []} onChange={field.onChange} suggestions={[...COMMON_SKILLS]} />
          )}
        />
      </Field>

      <div className="flex items-center gap-3">
        <Button size="sm" type="submit" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          Save changes
        </Button>
        {state === "saved" && !isDirty ? (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <LuCheck className="size-3.5" aria-hidden />
            Saved
          </span>
        ) : null}
        {state === "error" ? (
          <span className="inline-flex items-center gap-1 text-xs text-danger">
            <LuCircleAlert className="size-3.5" aria-hidden />
            {message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
