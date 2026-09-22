"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/Field";
import { FormSection } from "@/components/forms/FormSection";
import { StepShell } from "@/components/forms/StepShell";
import { OTHER_UNIVERSITY, UniversityCombobox, type UniversityOption } from "@/components/forms/UniversityCombobox";
import { ACADEMIC_LEVELS, NIGERIAN_BANKS } from "@/lib/constants";
import { ambassadorApplicationSchema, type AmbassadorApplicationInput } from "@/lib/validations/application";

const STEPS = [
  { id: "about", label: "About you" },
  { id: "login", label: "Your login" },
  { id: "campus", label: "Your campus" },
  { id: "payment", label: "Payment & agreement" },
];

/** Fields that belong to each page, used to validate a page before moving on. */
const STEP_FIELDS: (keyof AmbassadorApplicationInput)[][] = [
  ["fullName", "phone"],
  ["email", "password", "confirmPassword"],
  ["universityId", "otherUniversity", "department", "level"],
  ["bankName", "accountNumber", "accountName", "motivation", "agreeTerms", "emailCode"],
];

/**
 * Ambassador application, four short pages. No outer container — each page
 * carries one titled section, and the fields carry the affordance.
 */
export function ApplyForm({
  universities,
  slotCode,
}: {
  universities: UniversityOption[];
  /** Slot auto-assigned for this visit (first vacant, else next number). */
  slotCode: string;
}) {
  const router = useRouter();
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [uniChoice, setUniChoice] = React.useState("");
  // The email already has a login: a code was emailed and is asked for before the application is saved.
  const [needCode, setNeedCode] = React.useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AmbassadorApplicationInput>({
    resolver: zodResolver(ambassadorApplicationSchema),
    mode: "onBlur",
    defaultValues: {
      fullName: "",
      phone: "",
      email: "",
      password: "",
      confirmPassword: "",
      emailCode: "",
      universityId: "",
      otherUniversity: "",
      department: "",
      level: "",
      motivation: "",
      bankName: "",
      accountNumber: "",
      accountName: "",
      agreeTerms: false,
    },
  });

  const motivation = watch("motivation") ?? "";
  const [step, setStep] = React.useState(0);

  // The schema's cross-field rules (superRefine) never run on a partial trigger,
  // so the ones that belong to a page are checked here.
  const validateStep = async (i: number) => {
    let ok = await trigger(STEP_FIELDS[i], { shouldFocus: true });
    if (i === 1 && getValues("password") !== getValues("confirmPassword")) {
      setError("confirmPassword", { message: "Passwords do not match" }, { shouldFocus: true });
      ok = false;
    }
    if (i === 2 && !getValues("universityId") && !getValues("otherUniversity")?.trim()) {
      setError(
        "universityId",
        { message: "Select your university (or choose Other and type it in)" },
        { shouldFocus: true },
      );
      ok = false;
    }
    return ok;
  };

  const next = async () => {
    if (await validateStep(step)) setStep((v) => Math.min(v + 1, STEPS.length - 1));
  };

  // A failed final submit jumps to the first page that holds an error.
  const onInvalid = (errs: Record<string, unknown>) => {
    const i = STEP_FIELDS.findIndex((fields) => fields.some((f) => errs[f]));
    if (i >= 0) setStep(i);
  };

  const onSubmit = async (data: AmbassadorApplicationInput) => {
    setSubmitError(null);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          code?: string;
        } | null;
        if (body?.code === "VERIFY_EMAIL") {
          setNeedCode(true);
          return;
        }
        throw new Error(body?.error ?? "Could not submit your application.");
      }
      const result = (await res.json().catch(() => null)) as {
        slotCode?: string;
      } | null;
      router.push(`/apply/success?slot=${encodeURIComponent(result?.slotCode ?? slotCode)}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not submit your application.");
    }
  };

  return (
    <form
      onSubmit={(e) => {
        if (step < STEPS.length - 1) {
          e.preventDefault();
          void next();
          return;
        }
        void handleSubmit(onSubmit, onInvalid)(e);
      }}
      noValidate
    >
      <StepShell
        steps={STEPS}
        step={step}
        onBack={() => setStep((v) => Math.max(v - 1, 0))}
        onNext={() => void next()}
        submitting={isSubmitting}
        submitLabel="Apply now"
        error={submitError}
      >
        {[
          <div key="about" className="space-y-8">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-zone px-4 py-3">
              <span className="meta-label">Your slot ID</span>
              <span className="font-mono text-base font-medium text-primary">EduCraftA-{slotCode}</span>
              <span className="text-xs text-muted-foreground">Assigned automatically</span>
            </div>
            <FormSection title="Personal information">
              <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2">
                <Field label="Full name" required htmlFor="a-name" error={errors.fullName?.message}>
                  <Input id="a-name" autoComplete="name" {...register("fullName")} />
                </Field>
                <Field label="WhatsApp number" required htmlFor="a-phone" error={errors.phone?.message}>
                  <Input id="a-phone" inputMode="tel" autoComplete="tel" {...register("phone")} />
                </Field>
              </div>
            </FormSection>
          </div>,

          <div key="login" className="space-y-8">
            <FormSection
              title="Your dashboard login"
              description="You will use these to sign in to your own ambassador dashboard once you are approved. Already a worker? Use the same email: we will ask for a code and you keep your current password."
            >
              <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2">
                <Field label="Email" required htmlFor="a-email" error={errors.email?.message} className="sm:col-span-2">
                  <Input id="a-email" type="email" inputMode="email" autoComplete="email" {...register("email")} />
                </Field>
                <Field
                  label="Password"
                  required
                  htmlFor="a-password"
                  error={errors.password?.message}
                  hint="At least 8 characters"
                >
                  <Input id="a-password" type="password" autoComplete="new-password" {...register("password")} />
                </Field>
                <Field label="Confirm password" required htmlFor="a-password2" error={errors.confirmPassword?.message}>
                  <Input
                    id="a-password2"
                    type="password"
                    autoComplete="new-password"
                    {...register("confirmPassword")}
                  />
                </Field>
              </div>
            </FormSection>
          </div>,

          <div key="campus" className="space-y-8">
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
          </div>,

          <div key="payment" className="space-y-8">
            <FormSection
              title="Payment details"
              description="How your commission gets paid — kept accurate to the bank record."
            >
              <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2">
                <Field label="Bank" required htmlFor="a-bank" error={errors.bankName?.message}>
                  <Input id="a-bank" list="a-bank-list" autoComplete="off" {...register("bankName")} />
                  <datalist id="a-bank-list">
                    {NIGERIAN_BANKS.map((b) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Account number" required htmlFor="a-acctno" error={errors.accountNumber?.message}>
                  <Input
                    id="a-acctno"
                    inputMode="numeric"
                    maxLength={10}
                    autoComplete="off"
                    {...register("accountNumber")}
                  />
                </Field>
                <Field
                  label="Account name"
                  required
                  htmlFor="a-acctname"
                  error={errors.accountName?.message}
                  hint="Must match your bank record exactly"
                  className="sm:col-span-2"
                >
                  <Input id="a-acctname" autoComplete="off" {...register("accountName")} />
                </Field>
              </div>
            </FormSection>

            <FormSection title="Why EduCraft">
              <Field
                label="Why do you want to be an EduCraft ambassador?"
                required
                htmlFor="a-why"
                error={errors.motivation?.message as string | undefined}
                hint={`${motivation.length}/200 characters`}
              >
                <Textarea id="a-why" rows={4} maxLength={200} {...register("motivation")} />
              </Field>

              <label className="mt-5 flex items-start gap-3 rounded-xl bg-zone p-4">
                <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" {...register("agreeTerms")} />
                <span className="text-sm text-foreground">
                  I agree to represent EduCraft accurately, and understand my commission rate depends on my tier and is
                  paid to the account above after a referred client&apos;s order is confirmed.
                </span>
              </label>
              {errors.agreeTerms ? <p className="mt-1.5 text-xs text-danger">{errors.agreeTerms.message}</p> : null}
            </FormSection>

            {needCode ? (
              <FormSection
                title="Confirm your email"
                description="This email already has an EduCraft login. We sent a 6-digit code to it. Enter it to add this role to your existing login; your current password does not change."
              >
                <Field label="6-digit code" required htmlFor="a-code" error={errors.emailCode?.message}>
                  <Input
                    id="a-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="123456"
                    className="font-mono tracking-[0.4em]"
                    {...register("emailCode")}
                  />
                </Field>
              </FormSection>
            ) : null}
          </div>,
        ]}
      </StepShell>
    </form>
  );
}
