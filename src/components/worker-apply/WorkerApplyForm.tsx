"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { LuCircleAlert, LuEye, LuEyeOff, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/Field";
import { FormActions } from "@/components/forms/FormActions";
import { FormSection } from "@/components/forms/FormSection";
import { TagInput } from "@/components/forms/TagInput";
import { COMMON_SKILLS, COMMON_SPECIALTIES } from "@/lib/constants";
import { workerRegistrationSchema } from "@/lib/validations/worker-application";

/** Client-only extension — confirmPassword never leaves this form. */
const formSchema = workerRegistrationSchema
  .extend({ confirmPassword: z.string().min(1, "Confirm your password") })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof formSchema>;

/**
 * Worker self-registration. One scrolling form with titled sections — same
 * shape as the ambassador /apply form and the admin "Add worker" form, not a
 * step wizard, matching how every other registration flow in this app works.
 */
export function WorkerApplyForm() {
  const router = useRouter();
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [showPassword, setShowPassword] = React.useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    defaultValues: {
      fullName: "",
      phone: "",
      email: "",
      educationLevel: "",
      specialties: [],
      skills: [],
      bankName: "",
      accountNumber: "",
      accountName: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data: FormValues) => {
    setSubmitError(null);
    const { confirmPassword: _confirmPassword, ...payload } = data;
    void _confirmPassword;
    try {
      const res = await fetch("/api/worker-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not submit your application.");
      }
      router.push("/apply/worker/success");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not submit your application.");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-12">
      <FormSection title="Personal information">
        <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2">
          <Field label="Full name" required htmlFor="w-name" error={errors.fullName?.message}>
            <Input id="w-name" autoComplete="name" {...register("fullName")} />
          </Field>
          <Field label="Phone" required htmlFor="w-phone" error={errors.phone?.message}>
            <Input id="w-phone" inputMode="tel" autoComplete="tel" {...register("phone")} />
          </Field>
          <Field
            label="Email"
            required
            htmlFor="w-email"
            error={errors.email?.message}
            className="sm:col-span-2"
          >
            <Input id="w-email" type="email" inputMode="email" autoComplete="email" {...register("email")} />
          </Field>
          <Field label="Education level" htmlFor="w-edu" error={errors.educationLevel?.message}>
            <Input id="w-edu" placeholder="e.g. BSc, MSc" {...register("educationLevel")} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Specialties & skills" description="What you can take on once approved.">
        <div className="space-y-5">
          <Field
            label="Specialties (departments)"
            htmlFor="w-specialties"
            error={errors.specialties?.message as string | undefined}
            hint="Departments you can handle"
          >
            <Controller
              control={control}
              name="specialties"
              render={({ field }) => (
                <TagInput
                  id="w-specialties"
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
            htmlFor="w-skills"
            error={errors.skills?.message as string | undefined}
            hint="Tools and techniques — SPSS, MATLAB, AutoCAD…"
          >
            <Controller
              control={control}
              name="skills"
              render={({ field }) => (
                <TagInput
                  id="w-skills"
                  value={field.value ?? []}
                  onChange={field.onChange}
                  placeholder="Type a skill and press Enter"
                  suggestions={[...COMMON_SKILLS]}
                />
              )}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="Payout details"
        description="Where we'll send your earnings — you can also add this later."
      >
        <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2">
          <Field label="Bank name" htmlFor="w-bank" error={errors.bankName?.message}>
            <Input id="w-bank" autoComplete="off" {...register("bankName")} />
          </Field>
          <Field label="Account number" htmlFor="w-acctno" error={errors.accountNumber?.message}>
            <Input id="w-acctno" inputMode="numeric" autoComplete="off" {...register("accountNumber")} />
          </Field>
          <Field
            label="Account name"
            htmlFor="w-acctname"
            error={errors.accountName?.message}
            className="sm:col-span-2"
          >
            <Input id="w-acctname" autoComplete="off" {...register("accountName")} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Account setup" description="Set the password you'll use to sign in once approved.">
        <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2">
          <Field label="Password" required htmlFor="w-password" error={errors.password?.message}>
            <div className="relative">
              <Input
                id="w-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                className="pr-12"
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-subtle transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {showPassword ? <LuEyeOff className="size-[18px]" aria-hidden /> : <LuEye className="size-[18px]" aria-hidden />}
              </button>
            </div>
          </Field>
          <Field
            label="Confirm password"
            required
            htmlFor="w-password2"
            error={errors.confirmPassword?.message}
          >
            <Input
              id="w-password2"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              {...register("confirmPassword")}
            />
          </Field>
        </div>
      </FormSection>

      {submitError ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {submitError}
        </p>
      ) : null}

      <FormActions>
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          {isSubmitting ? "Submitting…" : "Submit application"}
        </Button>
      </FormActions>
    </form>
  );
}
