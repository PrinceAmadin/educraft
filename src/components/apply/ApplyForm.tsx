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
  ambassadorApplicationSchema,
  type AmbassadorApplicationInput,
} from "@/lib/validations/application";

const OTHER = "__other__";

export function ApplyForm({
  universities,
}: {
  universities: { id: string; name: string; abbreviation: string }[];
}) {
  const router = useRouter();
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [uniChoice, setUniChoice] = React.useState("");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
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
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full name" required htmlFor="a-name" error={errors.fullName?.message}>
          <Input id="a-name" autoComplete="name" {...register("fullName")} />
        </Field>
        <Field label="Phone (WhatsApp)" required htmlFor="a-phone" error={errors.phone?.message}>
          <Input id="a-phone" inputMode="tel" autoComplete="tel" {...register("phone")} />
        </Field>
        <Field label="Email" htmlFor="a-email" error={errors.email?.message}>
          <Input id="a-email" type="email" inputMode="email" autoComplete="email" {...register("email")} />
        </Field>

        <Field
          label="University"
          required
          htmlFor="a-uni"
          error={errors.universityId?.message as string | undefined}
        >
          <Select
            id="a-uni"
            value={uniChoice}
            onChange={(e) => {
              const v = e.target.value;
              setUniChoice(v);
              if (v === OTHER) {
                setValue("universityId", "");
              } else {
                setValue("universityId", v, { shouldValidate: true });
                setValue("otherUniversity", "");
              }
            }}
          >
            <option value="">Select your university</option>
            {universities.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.abbreviation})
              </option>
            ))}
            <option value={OTHER}>Other</option>
          </Select>
        </Field>

        {uniChoice === OTHER ? (
          <Field
            label="Which university?"
            required
            htmlFor="a-otheruni"
            error={errors.otherUniversity?.message as string | undefined}
          >
            <Input id="a-otheruni" {...register("otherUniversity")} />
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

      <Field
        label="Why do you want to be an EduCraft ambassador?"
        htmlFor="a-why"
        error={errors.motivation?.message as string | undefined}
        hint={`${motivation.length}/200 characters`}
      >
        <textarea
          id="a-why"
          rows={4}
          maxLength={200}
          className="w-full rounded-lg border border-border bg-input p-3 text-sm text-foreground placeholder:text-subtle focus-visible:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          {...register("motivation")}
        />
      </Field>

      {submitError ? (
        <p className="flex items-start gap-2 text-sm text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {submitError}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {isSubmitting ? "Submitting…" : "Apply now"}
      </Button>
    </form>
  );
}
