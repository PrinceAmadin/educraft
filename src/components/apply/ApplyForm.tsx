"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LuCircleAlert, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/Field";
import { FormSection } from "@/components/forms/FormSection";
import {
  OTHER_UNIVERSITY,
  UniversityCombobox,
  type UniversityOption,
} from "@/components/forms/UniversityCombobox";
import { ACADEMIC_LEVELS } from "@/lib/constants";
import {
  ambassadorApplicationSchema,
  type AmbassadorApplicationInput,
} from "@/lib/validations/application";

/**
 * Ambassador application. No outer container — three titled sections carry the
 * organisation, and the fields themselves carry the affordance.
 */
export function ApplyForm({ universities }: { universities: UniversityOption[] }) {
  const router = useRouter();
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [uniChoice, setUniChoice] = React.useState("");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<AmbassadorApplicationInput>({
    resolver: zodResolver(ambassadorApplicationSchema),
    mode: "onBlur",
    defaultValues: {
      fullName: "",
      phone: "",
      email: "",
      universityId: "",
      otherUniversity: "",
      department: "",
      level: "",
      motivation: "",
    },
  });

  const motivation = watch("motivation") ?? "";

  const onSubmit = async (data: AmbassadorApplicationInput) => {
    setSubmitError(null);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not submit your application.");
      }
      router.push("/apply/success");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not submit your application.");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-12">
      <FormSection title="Personal information">
        <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2">
          <Field label="Full name" required htmlFor="a-name" error={errors.fullName?.message}>
            <Input id="a-name" autoComplete="name" {...register("fullName")} />
          </Field>
          <Field label="WhatsApp number" required htmlFor="a-phone" error={errors.phone?.message}>
            <Input id="a-phone" inputMode="tel" autoComplete="tel" {...register("phone")} />
          </Field>
          <Field label="Email" htmlFor="a-email" error={errors.email?.message} className="sm:col-span-2">
            <Input id="a-email" type="email" inputMode="email" autoComplete="email" {...register("email")} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Your campus" description="Where you'll represent EduCraft.">
        <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2">
          <Field
            label="University"
            required
            htmlFor="a-uni"
            error={errors.universityId?.message as string | undefined}
            className="sm:col-span-2"
          >
            <UniversityCombobox
              id="a-uni"
              universities={universities}
              value={uniChoice}
              invalid={!!errors.universityId}
              onChange={(v, typed) => {
                setUniChoice(v);
                if (v === OTHER_UNIVERSITY) {
                  setValue("universityId", "");
                  if (typed) setValue("otherUniversity", typed);
                } else {
                  setValue("universityId", v, { shouldValidate: true });
                  setValue("otherUniversity", "");
                }
              }}
              onBlur={() => void trigger("universityId")}
            />
          </Field>

          {uniChoice === OTHER_UNIVERSITY ? (
            <Field
              label="Which university?"
              required
              htmlFor="a-otheruni"
              error={errors.otherUniversity?.message as string | undefined}
              className="sm:col-span-2"
            >
              <Input id="a-otheruni" autoFocus {...register("otherUniversity")} />
            </Field>
          ) : null}

          <Field label="Department" htmlFor="a-dept">
            <Input id="a-dept" {...register("department")} />
          </Field>
          <Field label="Level" htmlFor="a-level">
            <Select id="a-level" {...register("level")}>
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

      <FormSection title="Why EduCraft">
        <Field
          label="Why do you want to be an EduCraft ambassador?"
          htmlFor="a-why"
          error={errors.motivation?.message as string | undefined}
          hint={`${motivation.length}/200 characters`}
        >
          <Textarea id="a-why" rows={4} maxLength={200} {...register("motivation")} />
        </Field>
      </FormSection>

      <div className="space-y-4">
        {submitError ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-danger">
            <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {submitError}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={isSubmitting}>
          {isSubmitting ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          {isSubmitting ? "Submitting…" : "Apply now"}
        </Button>
      </div>
    </form>
  );
}
