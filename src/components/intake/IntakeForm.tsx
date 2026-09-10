"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FormProvider, useForm, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/forms/Field";
import { FormProgress } from "@/components/intake/FormProgress";
import { intakeSubmitSchema, type IntakeSubmitInput } from "@/lib/validations/intake";
import { TEMPLATE_STEPS, type IntakeTemplate } from "@/lib/intake-templates";
import { ACADEMIC_LEVELS, PROJECT_TYPES, REFERENCING_STYLES } from "@/lib/constants";
import { computePrice } from "@/lib/pricing";
import { cn, formatNaira } from "@/lib/utils";

interface ServiceProp {
  serviceCode: string;
  serviceName: string;
  basePrice: number;
  estimatedDays: number;
  expressDeliverySurcharge: number | null;
  pricingModel: string;
}

type UniversityOption = { id: string; name: string; abbreviation: string };

const DATA_OPTIONS = [
  { value: "PRIMARY", label: "Primary (I will collect data)" },
  { value: "SECONDARY", label: "Secondary (existing data / literature)" },
  { value: "BOTH", label: "Both" },
  { value: "NONE", label: "None" },
  { value: "NOT_SURE", label: "Not sure yet" },
];

const STEP_FIELDS: Record<IntakeTemplate, Record<string, (keyof IntakeSubmitInput)[]>> = {
  academic_fyp: {
    personal: ["fullName", "phone", "email", "universityId", "faculty", "department", "level", "matricNumber", "referralCode"],
    project: ["projectTitle", "supervisorName", "hodName", "projectType", "chapterCount", "referencingStyle", "dataRequirements", "minimumPages"],
    requirements: ["departmentOutline", "proposalNotes", "specialInstructions", "clientDeadline", "isExpressDelivery"],
    prelims: ["dedicationType", "dedicationDetails", "acknowledgmentDetails"],
    review: ["agreeTerms"],
  },
  academic_fyp_proposal: {
    personal: ["fullName", "phone", "email", "universityId", "faculty", "department", "level", "matricNumber", "referralCode"],
    project: ["projectTitle", "supervisorName", "hodName", "projectType", "chapterCount", "referencingStyle", "dataRequirements", "minimumPages"],
    requirements: ["departmentOutline", "proposalNotes", "specialInstructions", "clientDeadline", "isExpressDelivery"],
    prelims: ["dedicationType", "dedicationDetails", "acknowledgmentDetails"],
    review: ["agreeTerms"],
  },
  academic_fyp_chapter: {
    personal: ["fullName", "phone", "email", "universityId", "faculty", "department", "level", "matricNumber", "referralCode"],
    project: ["projectTitle", "supervisorName", "hodName", "projectType", "chapterCount", "referencingStyle", "dataRequirements", "minimumPages"],
    requirements: ["departmentOutline", "proposalNotes", "specialInstructions", "clientDeadline", "isExpressDelivery"],
    prelims: ["dedicationType", "dedicationDetails", "acknowledgmentDetails"],
    review: ["agreeTerms"],
  },
  academic_termpaper: {
    personal: ["fullName", "phone", "email", "universityId", "department", "level", "referralCode"],
    details: ["courseTitle", "courseCode", "projectTitle", "wordCount", "referencingStyle", "clientDeadline"],
    files: ["lecturerInstructions"],
    review: ["agreeTerms"],
  },
  academic_seminar: {
    personal: ["fullName", "phone", "email", "universityId", "faculty", "department", "level", "matricNumber", "referralCode"],
    seminar: ["projectTitle", "supervisorName", "referencingStyle"],
    requirements: ["departmentOutline", "specialInstructions", "clientDeadline", "isExpressDelivery"],
    review: ["agreeTerms"],
  },
};

export function IntakeForm({
  template,
  service,
  universities,
}: {
  template: IntakeTemplate;
  service: ServiceProp;
  universities: UniversityOption[];
}) {
  const router = useRouter();
  const steps = TEMPLATE_STEPS[template];
  const [step, setStep] = React.useState(0);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const form = useForm<IntakeSubmitInput>({
    resolver: zodResolver(intakeSubmitSchema),
    mode: "onBlur",
    defaultValues: {
      template: template === "academic_fyp" || template.startsWith("academic_fyp")
        ? "academic_fyp"
        : template === "academic_termpaper"
          ? "academic_termpaper"
          : "academic_seminar",
      serviceCode: service.serviceCode,
      fullName: "",
      phone: "",
      email: "",
      universityId: "",
      faculty: "",
      department: "",
      level: "",
      matricNumber: "",
      referralCode: "",
      projectTitle: "",
      supervisorName: "",
      hodName: "",
      projectType: "",
      referencingStyle: "",
      dataRequirements: "",
      minimumPages: "",
      courseTitle: "",
      courseCode: "",
      lecturerInstructions: "",
      departmentOutline: "",
      proposalNotes: "",
      specialInstructions: "",
      clientDeadline: "",
      isExpressDelivery: false,
      dedicationType: "",
      dedicationDetails: "",
      acknowledgmentDetails: "",
      // agreeTerms intentionally unset (literal true required)
    } as Partial<IntakeSubmitInput> as IntakeSubmitInput,
  });

  const { trigger, handleSubmit, watch } = form;
  const stepId = steps[step].id;
  const isReview = stepId === "review";
  const isExpress = watch("isExpressDelivery");

  const price = computePrice({
    basePrice: service.basePrice,
    expressSurcharge: service.expressDeliverySurcharge ?? 0,
    isExpressDelivery: Boolean(isExpress),
  });

  async function next() {
    setSubmitError(null);
    const fields = STEP_FIELDS[template][stepId] ?? [];
    const ok = await trigger(fields as never[], { shouldFocus: true });
    if (ok) {
      setStep((s) => Math.min(s + 1, steps.length - 1));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function back() {
    setSubmitError(null);
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const onSubmit = async (data: IntakeSubmitInput) => {
    setSubmitError(null);
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = (await res.json().catch(() => null)) as
        | { projectId?: string; error?: string }
        | null;
      if (!res.ok || !body?.projectId) {
        throw new Error(body?.error ?? "Could not submit. Please try again.");
      }
      router.push(`/intake/success?p=${encodeURIComponent(body.projectId)}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not submit. Please try again.");
    }
  };

  const isSubmitting = form.formState.isSubmitting;

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        <FormProgress steps={steps} current={step} />

        <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
          <StepContent
            template={template}
            stepId={stepId}
            universities={universities}
            service={service}
            price={price}
          />
        </div>

        {submitError ? (
          <p className="flex items-start gap-2 text-sm text-danger">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {submitError}
          </p>
        ) : null}

        <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <Button type="button" variant="ghost" onClick={back} disabled={step === 0 || isSubmitting}>
            Back
          </Button>
          {isReview ? (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {isSubmitting ? "Submitting…" : "Submit project"}
            </Button>
          ) : (
            <Button type="button" onClick={next}>
              Continue
            </Button>
          )}
        </div>
      </form>
    </FormProvider>
  );
}

// ── Step router ──────────────────────────────────────────────

function StepContent({
  template,
  stepId,
  universities,
  service,
  price,
}: {
  template: IntakeTemplate;
  stepId: string;
  universities: UniversityOption[];
  service: ServiceProp;
  price: ReturnType<typeof computePrice>;
}) {
  if (stepId === "personal")
    return <PersonalStep universities={universities} minimal={template === "academic_termpaper"} />;
  if (stepId === "project") return <FypProjectStep />;
  if (stepId === "requirements" && template === "academic_seminar") return <SeminarRequirementsStep service={service} />;
  if (stepId === "requirements") return <FypRequirementsStep service={service} />;
  if (stepId === "prelims") return <FypPrelimsStep />;
  if (stepId === "seminar") return <SeminarStep />;
  if (stepId === "details") return <TermDetailsStep />;
  if (stepId === "files") return <TermFilesStep />;
  if (stepId === "review") return <ReviewStep service={service} price={price} />;
  return null;
}

// ── Shared field helpers ─────────────────────────────────────

function ReferencingField() {
  const { register } = useFormContext<IntakeSubmitInput>();
  return (
    <Field label="Referencing style" htmlFor="referencingStyle">
      <Select id="referencingStyle" {...register("referencingStyle")}>
        <option value="">Not sure / school default</option>
        {REFERENCING_STYLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function DeadlineField() {
  const {
    register,
    formState: { errors },
  } = useFormContext<IntakeSubmitInput>();
  return (
    <Field
      label="When do you need it?"
      htmlFor="clientDeadline"
      error={errors.clientDeadline?.message as string | undefined}
    >
      <Input id="clientDeadline" type="date" {...register("clientDeadline")} />
    </Field>
  );
}

function ExpressField({ service }: { service: ServiceProp }) {
  const { register } = useFormContext<IntakeSubmitInput>();
  return (
    <label className="flex items-start gap-3 rounded-lg border border-border p-3">
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" {...register("isExpressDelivery")} />
      <span className="text-sm">
        <span className="font-medium text-foreground">Express delivery</span>
        <span className="block text-xs text-muted-foreground">
          {service.expressDeliverySurcharge
            ? `Adds ${formatNaira(service.expressDeliverySurcharge)} for a faster turnaround`
            : "Faster turnaround where possible"}
        </span>
      </span>
    </label>
  );
}

// ── Steps ────────────────────────────────────────────────────

function PersonalStep({
  universities,
  minimal,
}: {
  universities: UniversityOption[];
  minimal: boolean;
}) {
  const {
    register,
    formState: { errors },
  } = useFormContext<IntakeSubmitInput>();

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-foreground">Your details</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full name" required htmlFor="fullName" error={errors.fullName?.message}>
          <Input id="fullName" autoComplete="name" {...register("fullName")} />
        </Field>
        <Field label="Phone (WhatsApp)" required htmlFor="phone" error={errors.phone?.message}>
          <Input id="phone" inputMode="tel" autoComplete="tel" {...register("phone")} />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" inputMode="email" autoComplete="email" {...register("email")} />
        </Field>
        <Field label="University" required htmlFor="universityId" error={errors.universityId?.message}>
          <Select id="universityId" {...register("universityId")}>
            <option value="">Select your university</option>
            {universities.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.abbreviation})
              </option>
            ))}
          </Select>
        </Field>
        {!minimal ? (
          <Field label="Faculty" htmlFor="faculty">
            <Input id="faculty" {...register("faculty")} />
          </Field>
        ) : null}
        <Field label="Department" required htmlFor="department" error={errors.department?.message}>
          <Input id="department" {...register("department")} />
        </Field>
        <Field label="Level" htmlFor="level">
          <Select id="level" {...register("level")}>
            <option value="">Not specified</option>
            {ACADEMIC_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        {!minimal ? (
          <Field label="Matric number" htmlFor="matricNumber">
            <Input id="matricNumber" {...register("matricNumber")} />
          </Field>
        ) : null}
        <Field label="Referral code" htmlFor="referralCode" hint="From an EduCraft ambassador, if you have one">
          <Input id="referralCode" {...register("referralCode")} />
        </Field>
      </div>
    </div>
  );
}

function FypProjectStep() {
  const {
    register,
    formState: { errors },
  } = useFormContext<IntakeSubmitInput>();
  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-foreground">Project</h2>
      <Field label="Project topic" required htmlFor="projectTitle" error={errors.projectTitle?.message}>
        <Input id="projectTitle" {...register("projectTitle")} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Supervisor" htmlFor="supervisorName">
          <Input id="supervisorName" {...register("supervisorName")} />
        </Field>
        <Field label="Head of department" htmlFor="hodName">
          <Input id="hodName" {...register("hodName")} />
        </Field>
        <Field label="Project type" htmlFor="projectType">
          <Select id="projectType" {...register("projectType")}>
            <option value="">Not sure</option>
            {PROJECT_TYPES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Number of chapters" htmlFor="chapterCount" error={errors.chapterCount?.message as string | undefined}>
          <Input id="chapterCount" type="number" inputMode="numeric" min={1} max={20} {...register("chapterCount")} />
        </Field>
        <ReferencingField />
        <Field label="Data requirements" htmlFor="dataRequirements">
          <Select id="dataRequirements" {...register("dataRequirements")}>
            <option value="">Not sure</option>
            {DATA_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Minimum pages" htmlFor="minimumPages" hint="If your school sets a minimum">
          <Input id="minimumPages" {...register("minimumPages")} />
        </Field>
      </div>
    </div>
  );
}

function FypRequirementsStep({ service }: { service: ServiceProp }) {
  const { register } = useFormContext<IntakeSubmitInput>();
  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-foreground">Requirements</h2>
      <Field
        label="Department outline"
        htmlFor="departmentOutline"
        hint="Paste your department's project outline, or describe the structure they expect"
      >
        <textarea id="departmentOutline" rows={4} className={taClass} {...register("departmentOutline")} />
      </Field>
      <Field
        label="Proposal or existing work"
        htmlFor="proposalNotes"
        hint="Describe anything you've already written or been given"
      >
        <textarea id="proposalNotes" rows={3} className={taClass} {...register("proposalNotes")} />
      </Field>
      <Field label="Special instructions" htmlFor="specialInstructions">
        <textarea id="specialInstructions" rows={3} className={taClass} {...register("specialInstructions")} />
      </Field>
      <DeadlineField />
      <ExpressField service={service} />
      <p className="text-xs text-muted-foreground">
        You&apos;ll share files (outline, proposal, questionnaires) with us on WhatsApp after
        submitting.
      </p>
    </div>
  );
}

function FypPrelimsStep() {
  const { register, watch } = useFormContext<IntakeSubmitInput>();
  const dedication = watch("dedicationType");
  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-foreground">Preliminary pages</h2>
      <p className="text-sm text-muted-foreground">
        Optional now — you can send these later. They help us prepare your dedication and
        acknowledgment pages.
      </p>
      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium text-foreground">Dedication</legend>
        {[
          { value: "God", label: "To God" },
          { value: "Family", label: "To my family" },
          { value: "Both", label: "To God and my family" },
          { value: "Custom", label: "Someone specific" },
        ].map((o) => (
          <label key={o.value} className="flex items-center gap-2.5 text-sm">
            <input type="radio" value={o.value} className="size-4 accent-primary" {...register("dedicationType")} />
            {o.label}
          </label>
        ))}
      </fieldset>
      {dedication === "Custom" || dedication === "Family" || dedication === "Both" ? (
        <Field label="Names for the dedication" htmlFor="dedicationDetails">
          <Input id="dedicationDetails" placeholder="e.g. My parents, Mr & Mrs Okafor" {...register("dedicationDetails")} />
        </Field>
      ) : null}
      <Field
        label="Acknowledgment"
        htmlFor="acknowledgmentDetails"
        hint="People to thank — supervisor, family, friends, sponsors"
      >
        <textarea id="acknowledgmentDetails" rows={3} className={taClass} {...register("acknowledgmentDetails")} />
      </Field>
    </div>
  );
}

function SeminarStep() {
  const {
    register,
    formState: { errors },
  } = useFormContext<IntakeSubmitInput>();
  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-foreground">Seminar details</h2>
      <Field label="Seminar topic" required htmlFor="projectTitle" error={errors.projectTitle?.message}>
        <Input id="projectTitle" {...register("projectTitle")} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Supervisor" htmlFor="supervisorName">
          <Input id="supervisorName" {...register("supervisorName")} />
        </Field>
        <ReferencingField />
      </div>
    </div>
  );
}

function SeminarRequirementsStep({ service }: { service: ServiceProp }) {
  const { register } = useFormContext<IntakeSubmitInput>();
  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-foreground">Requirements</h2>
      <Field
        label="Department outline / structure"
        htmlFor="departmentOutline"
        hint="Paste or describe what your department expects"
      >
        <textarea id="departmentOutline" rows={4} className={taClass} {...register("departmentOutline")} />
      </Field>
      <Field label="Special instructions" htmlFor="specialInstructions">
        <textarea id="specialInstructions" rows={3} className={taClass} {...register("specialInstructions")} />
      </Field>
      <DeadlineField />
      <ExpressField service={service} />
    </div>
  );
}

function TermDetailsStep() {
  const {
    register,
    formState: { errors },
  } = useFormContext<IntakeSubmitInput>();
  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-foreground">Details</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Course title" required htmlFor="courseTitle" error={errors.courseTitle?.message as string | undefined}>
          <Input id="courseTitle" {...register("courseTitle")} />
        </Field>
        <Field label="Course code" htmlFor="courseCode">
          <Input id="courseCode" {...register("courseCode")} />
        </Field>
      </div>
      <Field label="Topic" required htmlFor="projectTitle" error={errors.projectTitle?.message}>
        <Input id="projectTitle" {...register("projectTitle")} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Word count" htmlFor="wordCount" error={errors.wordCount?.message as string | undefined}>
          <Input id="wordCount" type="number" inputMode="numeric" min={1} {...register("wordCount")} />
        </Field>
        <ReferencingField />
      </div>
      <DeadlineField />
    </div>
  );
}

function TermFilesStep() {
  const { register } = useFormContext<IntakeSubmitInput>();
  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-foreground">Lecturer instructions</h2>
      <Field
        label="Paste the assignment brief"
        htmlFor="lecturerInstructions"
        hint="Everything your lecturer asked for — marking guide, format, sources"
      >
        <textarea id="lecturerInstructions" rows={6} className={taClass} {...register("lecturerInstructions")} />
      </Field>
      <p className="text-xs text-muted-foreground">
        Have a document? You&apos;ll be able to send it on WhatsApp once you submit.
      </p>
    </div>
  );
}

function ReviewStep({
  service,
  price,
}: {
  service: ServiceProp;
  price: ReturnType<typeof computePrice>;
}) {
  const {
    register,
    getValues,
    formState: { errors },
  } = useFormContext<IntakeSubmitInput>();
  const v = getValues();

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-foreground">Review &amp; submit</h2>

      <dl className="divide-y divide-border rounded-lg border border-border text-sm">
        <Row label="Service" value={service.serviceName} />
        <Row label="Name" value={v.fullName} />
        <Row label="Phone" value={v.phone} />
        <Row label="Department" value={v.department} />
        <Row label="Topic" value={v.projectTitle} />
        {v.clientDeadline ? <Row label="Needed by" value={v.clientDeadline} /> : null}
        <Row label="Express delivery" value={v.isExpressDelivery ? "Yes" : "No"} />
        {v.referralCode ? <Row label="Referral code" value={v.referralCode} /> : null}
      </dl>

      <div className="rounded-lg border border-border bg-elevated p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-foreground">Total price</span>
          <span className="font-mono font-semibold tabular-nums text-foreground">
            {service.pricingModel === "VARIABLE" && service.basePrice === 0
              ? "Confirmed after review"
              : formatNaira(price.total)}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between text-muted-foreground">
          <span>Pay now (45% downpayment)</span>
          <span className="font-mono tabular-nums">{formatNaira(price.downpaymentAmount)}</span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Balance after QA approval</span>
          <span className="font-mono tabular-nums">{formatNaira(price.balanceAmount)}</span>
        </div>
      </div>

      <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">What happens next</p>
        <p className="mt-1">
          We confirm your details on WhatsApp and send payment instructions. Work begins once your
          downpayment is verified. You can track progress any time with your project ID.
        </p>
      </div>

      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" {...register("agreeTerms")} />
        <span>
          I agree to EduCraft&apos;s terms: 45% downpayment to begin, balance on approval, and up to
          3 rounds of revisions within scope.
        </span>
      </label>
      {errors.agreeTerms ? (
        <p className="text-xs text-danger">{errors.agreeTerms.message as string}</p>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-[60%] text-right text-foreground">{value || "—"}</dd>
    </div>
  );
}

const taClass = cn(
  "w-full rounded-lg border border-border bg-input p-3 text-sm text-foreground placeholder:text-subtle",
  "focus-visible:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
);

