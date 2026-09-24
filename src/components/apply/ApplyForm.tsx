"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CheckboxRow } from "@/components/forms/CheckboxRow";
import { Field } from "@/components/forms/Field";
import { FormSection } from "@/components/forms/FormSection";
import { StepShell } from "@/components/forms/StepShell";
import { OTHER_UNIVERSITY, UniversityCombobox, type UniversityOption } from "@/components/forms/UniversityCombobox";
import {
  ACADEMIC_LEVELS,
  NIGERIAN_BANKS,
  REACH_ROLES,
  REACH_SIZES,
  SERVICE_CHECK_OPTIONS,
} from "@/lib/constants";
import { ambassadorApplicationSchema, type AmbassadorApplicationInput } from "@/lib/validations/application";

const STEPS = [
  { id: "about", label: "About you" },
  { id: "login", label: "Your login" },
  { id: "campus", label: "Your campus & reach" },
  { id: "job", label: "The job" },
  { id: "payment", label: "Payment & agreement" },
];

/** Fields that belong to each page, used to validate a page before moving on. */
const STEP_FIELDS: (keyof AmbassadorApplicationInput)[][] = [
  ["fullName", "phone"],
  ["email", "password", "confirmPassword"],
  ["universityId", "otherUniversity", "department", "level", "reachRoles", "reachSize", "reachGroups"],
  [
    "serviceCheck",
    "pitchMessage",
    "objectionReply",
    "clientUpsetReply",
    "expectedReferrals",
    "firstWeekPlan",
  ],
  ["bankName", "accountNumber", "accountName", "agreeTerms", "emailCode"],
];

/**
 * Ambassador application, five short pages. No outer container — each page
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
      reachRoles: [],
      reachSize: undefined,
      reachGroups: "",
      serviceCheck: undefined,
      pitchMessage: "",
      objectionReply: "",
      clientUpsetReply: "",
      expectedReferrals: undefined,
      firstWeekPlan: "",
      bankName: "",
      accountNumber: "",
      accountName: "",
      agreeTerms: false,
    },
  });

  const pitchMessage = watch("pitchMessage") ?? "";
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

            <FormSection
              title="Your reach"
              description="Who you can actually get this in front of. Numbers and names, not adjectives."
            >
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-foreground">
                  Which of these are you? <span className="text-danger">*</span>
                </p>
                <div className="space-y-2">
                  {REACH_ROLES.map((role) => (
                    <CheckboxRow key={role.value} value={role.value} {...register("reachRoles")}>
                      {role.label}
                    </CheckboxRow>
                  ))}
                </div>
                {errors.reachRoles ? (
                  <p className="text-xs text-danger">{errors.reachRoles.message as string}</p>
                ) : null}
              </div>

              <Field
                label="How many final-year students can you reach directly this month?"
                required
                htmlFor="a-reach-size"
                error={errors.reachSize?.message as string | undefined}
                hint="Directly means you can message or speak to them without going through anyone."
              >
                <Select id="a-reach-size" {...register("reachSize")}>
                  <option value="">Choose one</option>
                  {REACH_SIZES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Name the groups or pages you would post in."
                required
                htmlFor="a-reach-groups"
                error={errors.reachGroups?.message as string | undefined}
              >
                <Textarea
                  id="a-reach-groups"
                  rows={2}
                  maxLength={200}
                  placeholder="e.g. ME 2026 class group (312 members), FUPRE Engineering Students' Association page"
                  {...register("reachGroups")}
                />
              </Field>
            </FormSection>
          </div>,

          <div key="job" className="space-y-8">
            <FormSection title="What EduCraft does">
              <p className="text-sm leading-relaxed text-muted-foreground">
                EduCraft writes and designs academic work for students: final year projects and theses, seminar and IT
                reports, term papers, presentations and CVs. The student pays 45% to start and 55% after the work
                passes our quality check. You earn 10&ndash;15% of what your referral pays.
              </p>

              <Field
                label="Which of these does EduCraft NOT do?"
                required
                htmlFor="a-service-check"
                error={errors.serviceCheck?.message as string | undefined}
              >
                <Select id="a-service-check" {...register("serviceCheck")}>
                  <option value="">Choose one</option>
                  {SERVICE_CHECK_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </FormSection>

            <FormSection
              title="The job"
              description="Four short answers. We read these properly, so write them yourself."
            >
              <Field
                label="A final-year student in your department tells you they're stuck on their project. Write the exact message you'd send them."
                required
                htmlFor="a-pitch"
                error={errors.pitchMessage?.message as string | undefined}
                hint={
                  pitchMessage.length
                    ? `${pitchMessage.length}/600 characters`
                    : "Write it the way you'd really send it — WhatsApp voice is fine."
                }
              >
                <Textarea id="a-pitch" rows={5} maxLength={600} {...register("pitchMessage")} />
              </Field>

              <Field
                label="They reply: &ldquo;How do I know this is not a scam?&rdquo; What do you say?"
                required
                htmlFor="a-objection"
                error={errors.objectionReply?.message as string | undefined}
              >
                <Textarea id="a-objection" rows={3} maxLength={300} {...register("objectionReply")} />
              </Field>

              <Field
                label="A student you referred messages you upset — their deadline is close and they think the work is late. What do you do?"
                required
                htmlFor="a-upset"
                error={errors.clientUpsetReply?.message as string | undefined}
              >
                <Textarea id="a-upset" rows={3} maxLength={300} {...register("clientUpsetReply")} />
              </Field>

              <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2">
                <Field
                  label="How many students do you expect to bring in your first 30 days?"
                  required
                  htmlFor="a-expected"
                  error={errors.expectedReferrals?.message as string | undefined}
                  hint="A real number you'd stand behind — we check it at 30 days."
                >
                  <Input id="a-expected" inputMode="numeric" autoComplete="off" {...register("expectedReferrals")} />
                </Field>
                <Field
                  label="What is the first thing you'll do in week one?"
                  required
                  htmlFor="a-week-one"
                  error={errors.firstWeekPlan?.message as string | undefined}
                >
                  <Textarea id="a-week-one" rows={2} maxLength={200} {...register("firstWeekPlan")} />
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

            <FormSection title="Agreement">
              <CheckboxRow {...register("agreeTerms")}>
                I agree to represent EduCraft accurately, and understand my commission rate depends on my tier and is
                paid to the account above after a referred client&apos;s order is confirmed. I understand my slot is
                provisional for the first 30 days: if no order I referred is confirmed in that time, the slot is
                released for another applicant.
              </CheckboxRow>
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
