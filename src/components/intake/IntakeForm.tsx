"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, FormProvider, useFieldArray, useForm, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  LuCircleAlert as CircleAlert,
  LuLoaderCircle as Loader2,
  LuPlus as Plus,
  LuTrash2 as Trash2,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/Field";
import { TagInput } from "@/components/forms/TagInput";
import { UniversityCombobox } from "@/components/forms/UniversityCombobox";
import { FormProgress } from "@/components/intake/FormProgress";
import { intakeSubmitSchema, type IntakeSubmitInput } from "@/lib/validations/intake";
import { TEMPLATE_STEPS, type IntakeTemplate } from "@/lib/intake-templates";
import { ACADEMIC_LEVELS, PROJECT_TYPES, REFERENCING_STYLES, COMMON_SKILLS } from "@/lib/constants";
import { computePrice } from "@/lib/pricing";
import { baseOptionLabel } from "@/lib/service-groups";
import { AttachmentsField, UploadBusyContext } from "@/components/intake/AttachmentsField";
import { VariantField, type ServiceVariantProp } from "@/components/intake/VariantField";
import { formatNaira } from "@/lib/utils";

interface ServiceProp {
  variants?: ServiceVariantProp[];
  serviceCode: string;
  serviceName: string;
  basePrice: number;
  estimatedDays: number;
  expressDeliverySurcharge: number | null;
  pricingModel: string;
  downpaymentPercentage: number;
}

type UniversityOption = { id: string; name: string; abbreviation: string };

/**
 * Pro bono mode: the form posts to a one-time link instead of taking payment,
 * and every money or referral element disappears.
 */
export interface ProBonoMode {
  submitUrl: string;
  onDone: (projectId: string) => void;
}

const ProBonoContext = React.createContext(false);

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
  academic_it: {
    personal: ["fullName", "phone", "email", "universityId", "faculty", "department", "level", "matricNumber", "referralCode"],
    it: ["companyName", "companyAddress", "itDuration", "companyDepartment", "companySupervisor", "projectTitle"],
    files: ["specialInstructions", "clientDeadline"],
    review: ["agreeTerms"],
  },
  career_cv: {
    contact: ["fullName", "phone", "email", "linkedin", "address", "universityId", "referralCode"],
    education: ["education"],
    experience: ["experience"],
    skills: ["skills", "certifications"],
    style: ["stylePreference", "clientDeadline"],
    review: ["agreeTerms"],
  },
  design_presentation: {
    personal: ["fullName", "phone", "email", "universityId", "referralCode"],
    presentation: ["projectTitle", "purpose", "audience", "slideCount", "contentSource"],
    design: ["colorScheme", "designStyle"],
    files: ["specialInstructions", "clientDeadline", "isExpressDelivery"],
    review: ["agreeTerms"],
  },
  editing: {
    personal: ["fullName", "phone", "email", "universityId", "referralCode"],
    editing: ["editingType", "pageCount", "referencingStyle", "clientDeadline"],
    files: ["specialInstructions"],
    review: ["agreeTerms"],
  },
};

export function IntakeForm({
  template,
  service,
  universities,
  initialReferralCode = "",
  proBono,
}: {
  template: IntakeTemplate;
  service: ServiceProp;
  universities: UniversityOption[];
  initialReferralCode?: string;
  proBono?: ProBonoMode;
}) {
  const router = useRouter();
  const steps = TEMPLATE_STEPS[template];
  const [step, setStep] = React.useState(0);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const form = useForm<IntakeSubmitInput>({
    resolver: zodResolver(intakeSubmitSchema),
    mode: "onBlur",
    defaultValues: {
      template,
      serviceCode: service.serviceCode,
      serviceVariantId: "",
      attachments: [],
      fullName: "",
      phone: "",
      email: "",
      linkedin: "",
      address: "",
      universityId: "",
      faculty: "",
      department: "",
      level: "",
      matricNumber: "",
      referralCode: initialReferralCode,
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
      companyName: "",
      companyAddress: "",
      itDuration: "",
      companyDepartment: "",
      companySupervisor: "",
      education: [{ degree: "", school: "", year: "", cgpa: "" }],
      experience: [{ title: "", company: "", dates: "", description: "" }],
      skills: [],
      certifications: [],
      stylePreference: "",
      purpose: "",
      audience: "",
      contentSource: "",
      colorScheme: "",
      designStyle: "",
      editingType: "",
      departmentOutline: "",
      proposalNotes: "",
      specialInstructions: "",
      clientDeadline: "",
      isExpressDelivery: false,
      dedicationType: "",
      dedicationDetails: "",
      acknowledgmentDetails: "",
    } as Partial<IntakeSubmitInput> as IntakeSubmitInput,
  });

  const { trigger, handleSubmit, watch } = form;
  const stepId = steps[step].id;
  const isReview = stepId === "review";
  const isExpress = watch("isExpressDelivery");
  const variantId = watch("serviceVariantId");
  const variantAddon = service.variants?.find((v) => v.id === variantId)?.priceAddon ?? 0;
  const [uploading, setUploading] = React.useState(false);

  const price = computePrice({
    basePrice: service.basePrice + variantAddon,
    expressSurcharge: service.expressDeliverySurcharge ?? 0,
    isExpressDelivery: Boolean(isExpress),
    downpaymentPercentage: service.downpaymentPercentage,
  });

  // Variable-priced services (amount confirmed on WhatsApp, not upfront) have
  // no fixed downpayment to charge before submission — they keep the old
  // submit-then-arrange-payment flow. Everything else is pay-first: the form
  // only becomes a real project once the Paystack downpayment clears.
  const variablePrice = !proBono && service.pricingModel === "VARIABLE" && service.basePrice === 0;

  async function next() {
    setSubmitError(null);
    if (uploading) {
      setSubmitError("Please wait for your files to finish uploading.");
      return;
    }
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
    if (uploading) {
      setSubmitError("Please wait for your files to finish uploading.");
      return;
    }

    // Pro bono link: no payment. The link itself enforces one submission from
    // one device, so a failure here leaves it usable.
    if (proBono) {
      try {
        const res = await fetch(proBono.submitUrl, {
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
        proBono.onDone(body.projectId);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "Could not submit. Please try again.");
      }
      return;
    }

    // Variable-priced services: no fixed amount to charge upfront, so this
    // still submits straight away and arranges payment on WhatsApp.
    if (variablePrice) {
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
      return;
    }

    // Everything else: pay first. Nothing is submitted yet — Paystack's
    // webhook creates the project once the downpayment actually clears, and
    // the redirect lands back here to poll for that.
    try {
      const res = await fetch("/api/intake/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = (await res.json().catch(() => null)) as
        | { authorizationUrl?: string; error?: string }
        | null;
      if (!res.ok || !body?.authorizationUrl) {
        throw new Error(body?.error ?? "Could not start payment. Please try again.");
      }
      window.location.href = body.authorizationUrl;
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not start payment. Please try again.");
    }
  };

  const isSubmitting = form.formState.isSubmitting;

  return (
    <ProBonoContext.Provider value={Boolean(proBono)}>
    <UploadBusyContext.Provider value={setUploading}>
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-9">
        <FormProgress steps={steps} current={step} />

        {step === 0 && service.variants && service.variants.length > 0 ? (
          <VariantField basePrice={service.basePrice} variants={service.variants} />
        ) : null}

        {/* The step sits directly on the page — its heading organises it, not a card. */}
        <StepContent
          template={template}
          stepId={stepId}
          universities={universities}
          service={service}
          price={price}
        />

        {submitError ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-danger">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {submitError}
          </p>
        ) : null}

        <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 bg-background/95 px-4 py-3 pb-safe shadow-[0_-12px_24px_-18px_rgb(15_23_42/0.25)] backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none">
          <Button type="button" variant="ghost" onClick={back} disabled={step === 0 || isSubmitting}>
            Back
          </Button>
          {isReview ? (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {proBono
                ? isSubmitting
                  ? "Submitting…"
                  : "Submit project"
                : isSubmitting
                ? variablePrice
                  ? "Submitting…"
                  : "Redirecting to Paystack…"
                : variablePrice
                  ? "Submit project"
                  : `Pay ${formatNaira(price.downpaymentAmount)} to submit`}
            </Button>
          ) : (
            <Button type="button" onClick={next}>
              Continue
            </Button>
          )}
        </div>
      </form>
    </FormProvider>
    </UploadBusyContext.Provider>
    </ProBonoContext.Provider>
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
  switch (stepId) {
    case "personal":
      return (
        <PersonalStep
          universities={universities}
          variant={
            template === "academic_termpaper" || template === "design_presentation" || template === "editing"
              ? "light"
              : "full"
          }
        />
      );
    case "contact":
      return <CvContactStep universities={universities} />;
    case "project":
      return <FypProjectStep />;
    case "requirements":
      return template === "academic_seminar" ? (
        <SeminarRequirementsStep service={service} />
      ) : (
        <FypRequirementsStep service={service} />
      );
    case "prelims":
      return <FypPrelimsStep />;
    case "seminar":
      return <SeminarStep />;
    case "details":
      return <TermDetailsStep />;
    case "it":
      return <ItStep />;
    case "education":
      return <CvEducationStep />;
    case "experience":
      return <CvExperienceStep />;
    case "skills":
      return <CvSkillsStep />;
    case "style":
      return <CvStyleStep />;
    case "presentation":
      return <PresentationStep />;
    case "design":
      return <PresentationDesignStep />;
    case "editing":
      return <EditingStep />;
    case "files":
      return <FilesStep template={template} service={service} />;
    case "review":
      return <ReviewStep template={template} service={service} price={price} />;
    default:
      return null;
  }
}

// ── Shared field helpers ─────────────────────────────────────

function ReferralField() {
  const { register } = useFormContext<IntakeSubmitInput>();
  const proBono = React.useContext(ProBonoContext);
  if (proBono) return null;
  return (
    <Field label="Referral code" htmlFor="referralCode" hint="From an EduCraft ambassador, if you have one">
      <Input id="referralCode" {...register("referralCode")} />
    </Field>
  );
}

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
    <Field label="When do you need it?" htmlFor="clientDeadline" error={errors.clientDeadline?.message as string | undefined}>
      <Input id="clientDeadline" type="date" {...register("clientDeadline")} />
    </Field>
  );
}

function ExpressField({ service }: { service: ServiceProp }) {
  const { register } = useFormContext<IntakeSubmitInput>();
  const proBono = React.useContext(ProBonoContext);
  if (proBono) return null;
  return (
    <label className="flex items-start gap-3 rounded-xl bg-zone p-3.5">
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

/** Type to filter or scroll the list — the intake requires a listed university. */
function UniversitySelect({ universities }: { universities: UniversityOption[] }) {
  const {
    control,
    formState: { errors },
  } = useFormContext<IntakeSubmitInput>();
  return (
    <Field label="University" required htmlFor="universityId" error={errors.universityId?.message as string | undefined}>
      <Controller
        control={control}
        name="universityId"
        render={({ field }) => (
          <UniversityCombobox
            id="universityId"
            universities={universities}
            value={(field.value as string | undefined) ?? ""}
            onChange={(v) => field.onChange(v)}
            onBlur={field.onBlur}
            allowOther={false}
            invalid={!!errors.universityId}
          />
        )}
      />
    </Field>
  );
}

// ── Academic steps ───────────────────────────────────────────

function PersonalStep({
  universities,
  variant,
}: {
  universities: UniversityOption[];
  variant: "full" | "light";
}) {
  const {
    register,
    formState: { errors },
  } = useFormContext<IntakeSubmitInput>();
  const full = variant === "full";

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Your details</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full name" required htmlFor="fullName" error={errors.fullName?.message}>
          <Input id="fullName" autoComplete="name" {...register("fullName")} />
        </Field>
        <Field label="Phone (WhatsApp)" required htmlFor="phone" error={errors.phone?.message}>
          <Input id="phone" inputMode="tel" autoComplete="tel" {...register("phone")} />
        </Field>
        <Field label="Email" required htmlFor="email" error={errors.email?.message} hint="We email your dashboard sign-in code here">
          <Input id="email" type="email" inputMode="email" autoComplete="email" {...register("email")} />
        </Field>
        <UniversitySelect universities={universities} />
        {full ? (
          <Field label="Faculty" htmlFor="faculty">
            <Input id="faculty" {...register("faculty")} />
          </Field>
        ) : null}
        <Field
          label="Department"
          required={full}
          htmlFor="department"
          error={errors.department?.message as string | undefined}
        >
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
        {full ? (
          <Field label="Matric number" htmlFor="matricNumber">
            <Input id="matricNumber" {...register("matricNumber")} />
          </Field>
        ) : null}
        <ReferralField />
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
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Project</h2>
      <Field label="Project topic" required htmlFor="projectTitle" error={errors.projectTitle?.message as string | undefined}>
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
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Requirements</h2>
      <Field label="Department outline" htmlFor="departmentOutline" hint="Paste your department's outline, or describe the structure they expect">
        <Textarea id="departmentOutline" rows={4} {...register("departmentOutline")} />
      </Field>
      <Field label="Proposal or existing work" htmlFor="proposalNotes" hint="Describe anything you've already written or been given">
        <Textarea id="proposalNotes" rows={3} {...register("proposalNotes")} />
      </Field>
      <AttachmentsField
        id="att-outline"
        category="department_outline"
        label="Department outline or table of contents (file)"
        hint="Upload the outline, TOC or format your department gave you"
      />
      <AttachmentsField
        id="att-docs"
        category="from_client"
        label="Proposal or other documents (files)"
        hint="Your approved proposal, earlier chapters, data files, anything we should work from"
      />
      <Field label="Special instructions" htmlFor="specialInstructions">
        <Textarea id="specialInstructions" rows={3} {...register("specialInstructions")} />
      </Field>
      <DeadlineField />
      <ExpressField service={service} />
      <p className="text-xs text-muted-foreground">
        You&apos;ll share files (outline, proposal, questionnaires) with us on WhatsApp after submitting.
      </p>
    </div>
  );
}

function FypPrelimsStep() {
  const { register, watch } = useFormContext<IntakeSubmitInput>();
  const dedication = watch("dedicationType");
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Preliminary pages</h2>
      <p className="text-sm text-muted-foreground">
        Optional now — these help us prepare your dedication and acknowledgment pages.
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
      <Field label="Acknowledgment" htmlFor="acknowledgmentDetails" hint="People to thank — supervisor, family, friends, sponsors">
        <Textarea id="acknowledgmentDetails" rows={3} {...register("acknowledgmentDetails")} />
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
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Seminar details</h2>
      <Field label="Seminar topic" required htmlFor="projectTitle" error={errors.projectTitle?.message as string | undefined}>
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
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Requirements</h2>
      <Field label="Department outline / structure" htmlFor="departmentOutline" hint="Paste or describe what your department expects">
        <Textarea id="departmentOutline" rows={4} {...register("departmentOutline")} />
      </Field>
      <AttachmentsField
        id="att-outline"
        category="department_outline"
        label="Department outline or format (file)"
        hint="Upload what your department expects"
      />
      <AttachmentsField id="att-docs" category="from_client" label="Other documents (files)" />
      <Field label="Special instructions" htmlFor="specialInstructions">
        <Textarea id="specialInstructions" rows={3} {...register("specialInstructions")} />
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
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Details</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Course title" required htmlFor="courseTitle" error={errors.courseTitle?.message as string | undefined}>
          <Input id="courseTitle" {...register("courseTitle")} />
        </Field>
        <Field label="Course code" htmlFor="courseCode">
          <Input id="courseCode" {...register("courseCode")} />
        </Field>
      </div>
      <Field label="Topic" required htmlFor="projectTitle" error={errors.projectTitle?.message as string | undefined}>
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

function ItStep() {
  const {
    register,
    formState: { errors },
  } = useFormContext<IntakeSubmitInput>();
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">IT placement</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Company / organisation" required htmlFor="companyName" error={errors.companyName?.message as string | undefined}>
          <Input id="companyName" {...register("companyName")} />
        </Field>
        <Field label="Company address" htmlFor="companyAddress">
          <Input id="companyAddress" {...register("companyAddress")} />
        </Field>
        <Field label="Placement duration" required htmlFor="itDuration" error={errors.itDuration?.message as string | undefined} hint="e.g. 3 months, 6 months, 1 year">
          <Input id="itDuration" {...register("itDuration")} />
        </Field>
        <Field label="Department at the company" htmlFor="companyDepartment">
          <Input id="companyDepartment" {...register("companyDepartment")} />
        </Field>
        <Field label="Supervisor at the company" htmlFor="companySupervisor">
          <Input id="companySupervisor" {...register("companySupervisor")} />
        </Field>
      </div>
      <Field label="Report topic / focus" required htmlFor="projectTitle" error={errors.projectTitle?.message as string | undefined}>
        <Input id="projectTitle" {...register("projectTitle")} />
      </Field>
    </div>
  );
}

// ── CV steps ─────────────────────────────────────────────────

function CvContactStep({ universities }: { universities: UniversityOption[] }) {
  const {
    register,
    formState: { errors },
  } = useFormContext<IntakeSubmitInput>();
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Contact</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full name" required htmlFor="fullName" error={errors.fullName?.message}>
          <Input id="fullName" autoComplete="name" {...register("fullName")} />
        </Field>
        <Field label="Phone (WhatsApp)" required htmlFor="phone" error={errors.phone?.message}>
          <Input id="phone" inputMode="tel" {...register("phone")} />
        </Field>
        <Field label="Email" required htmlFor="email" error={errors.email?.message} hint="We email your dashboard sign-in code here">
          <Input id="email" type="email" inputMode="email" {...register("email")} />
        </Field>
        <Field label="LinkedIn" htmlFor="linkedin" hint="Profile URL or handle">
          <Input id="linkedin" {...register("linkedin")} />
        </Field>
        <Field label="Address / city" htmlFor="address">
          <Input id="address" {...register("address")} />
        </Field>
        <UniversitySelect universities={universities} />
        <ReferralField />
      </div>
    </div>
  );
}

function CvEducationStep() {
  const { control, register } = useFormContext<IntakeSubmitInput>();
  const { fields, append, remove } = useFieldArray({ control, name: "education" });
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Education</h2>
      {fields.map((f, i) => (
        <div key={f.id} className="space-y-3 rounded-2xl bg-zone p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Entry {i + 1}</span>
            {fields.length > 1 ? (
              <button type="button" onClick={() => remove(i)} className="text-xs text-danger hover:underline" aria-label={`Remove education entry ${i + 1}`}>
                <Trash2 className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Degree / qualification" htmlFor={`edu-${i}-degree`}>
              <Input id={`edu-${i}-degree`} {...register(`education.${i}.degree` as const)} />
            </Field>
            <Field label="School" htmlFor={`edu-${i}-school`}>
              <Input id={`edu-${i}-school`} {...register(`education.${i}.school` as const)} />
            </Field>
            <Field label="Year" htmlFor={`edu-${i}-year`}>
              <Input id={`edu-${i}-year`} {...register(`education.${i}.year` as const)} />
            </Field>
            <Field label="CGPA / grade" htmlFor={`edu-${i}-cgpa`}>
              <Input id={`edu-${i}-cgpa`} {...register(`education.${i}.cgpa` as const)} />
            </Field>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => append({ degree: "", school: "", year: "", cgpa: "" })}>
        <Plus className="size-4" aria-hidden />
        Add education
      </Button>
    </div>
  );
}

function CvExperienceStep() {
  const { control, register } = useFormContext<IntakeSubmitInput>();
  const { fields, append, remove } = useFieldArray({ control, name: "experience" });
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Experience</h2>
      <p className="text-sm text-muted-foreground">Jobs, internships, volunteering, leadership roles.</p>
      {fields.map((f, i) => (
        <div key={f.id} className="space-y-3 rounded-2xl bg-zone p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Entry {i + 1}</span>
            {fields.length > 1 ? (
              <button type="button" onClick={() => remove(i)} className="text-danger hover:underline" aria-label={`Remove experience entry ${i + 1}`}>
                <Trash2 className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Title / role" htmlFor={`exp-${i}-title`}>
              <Input id={`exp-${i}-title`} {...register(`experience.${i}.title` as const)} />
            </Field>
            <Field label="Company / organisation" htmlFor={`exp-${i}-company`}>
              <Input id={`exp-${i}-company`} {...register(`experience.${i}.company` as const)} />
            </Field>
            <Field label="Dates" htmlFor={`exp-${i}-dates`} hint="e.g. Jun 2024 – Aug 2024">
              <Input id={`exp-${i}-dates`} {...register(`experience.${i}.dates` as const)} />
            </Field>
          </div>
          <Field label="What you did" htmlFor={`exp-${i}-desc`}>
            <Textarea id={`exp-${i}-desc`} rows={2} {...register(`experience.${i}.description` as const)} />
          </Field>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => append({ title: "", company: "", dates: "", description: "" })}>
        <Plus className="size-4" aria-hidden />
        Add experience
      </Button>
    </div>
  );
}

function CvSkillsStep() {
  const { control } = useFormContext<IntakeSubmitInput>();
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Skills &amp; certifications</h2>
      <Field label="Skills" htmlFor="skills" hint="Type and press Enter">
        <Controller
          control={control}
          name="skills"
          render={({ field }) => (
            <TagInput id="skills" value={field.value ?? []} onChange={field.onChange} placeholder="e.g. Microsoft Excel" suggestions={[...COMMON_SKILLS]} />
          )}
        />
      </Field>
      <Field label="Certifications" htmlFor="certifications" hint="Courses, licences, awards">
        <Controller
          control={control}
          name="certifications"
          render={({ field }) => (
            <TagInput id="certifications" value={field.value ?? []} onChange={field.onChange} placeholder="e.g. Google Data Analytics" />
          )}
        />
      </Field>
    </div>
  );
}

const CV_STYLES = [
  { value: "Modern", label: "Modern", blurb: "Clean, colour accent, single column" },
  { value: "Classic", label: "Classic", blurb: "Traditional, black & white, formal" },
  { value: "Creative", label: "Creative", blurb: "Bold layout, for design / media roles" },
];

function CvStyleStep() {
  const { register } = useFormContext<IntakeSubmitInput>();
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Style preference</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {CV_STYLES.map((s) => (
          <label
            key={s.value}
            className="flex cursor-pointer flex-col gap-1 rounded-xl bg-zone p-3.5 text-sm ring-1 ring-transparent transition-colors has-[:checked]:bg-primary/10 has-[:checked]:ring-primary/50"
          >
            <span className="flex items-center gap-2">
              <input type="radio" value={s.value} className="size-4 accent-primary" {...register("stylePreference")} />
              <span className="font-medium text-foreground">{s.label}</span>
            </span>
            <span className="text-xs text-muted-foreground">{s.blurb}</span>
          </label>
        ))}
      </div>
      <DeadlineField />
    </div>
  );
}

// ── Presentation steps ───────────────────────────────────────

function PresentationStep() {
  const {
    register,
    formState: { errors },
  } = useFormContext<IntakeSubmitInput>();
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Presentation</h2>
      <Field label="Topic" required htmlFor="projectTitle" error={errors.projectTitle?.message as string | undefined}>
        <Input id="projectTitle" {...register("projectTitle")} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Purpose" required htmlFor="purpose" error={errors.purpose?.message as string | undefined} hint="Class presentation, defence, pitch…">
          <Input id="purpose" {...register("purpose")} />
        </Field>
        <Field label="Audience" htmlFor="audience">
          <Input id="audience" {...register("audience")} />
        </Field>
        <Field label="Approx. slides" htmlFor="slideCount" error={errors.slideCount?.message as string | undefined}>
          <Input id="slideCount" type="number" inputMode="numeric" min={1} {...register("slideCount")} />
        </Field>
      </div>
      <Field label="Content source" htmlFor="contentSource" hint="Do you have the content, or should we write it? Paste what you have.">
        <Textarea id="contentSource" rows={3} {...register("contentSource")} />
      </Field>
    </div>
  );
}

function PresentationDesignStep() {
  const { register } = useFormContext<IntakeSubmitInput>();
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Design preferences</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Colour scheme" htmlFor="colorScheme" hint="Brand colours, school colours, or 'your choice'">
          <Input id="colorScheme" {...register("colorScheme")} />
        </Field>
        <Field label="Style" htmlFor="designStyle" hint="Minimal, corporate, playful…">
          <Input id="designStyle" {...register("designStyle")} />
        </Field>
      </div>
    </div>
  );
}

// ── Editing step ─────────────────────────────────────────────

function EditingStep() {
  const {
    register,
    formState: { errors },
  } = useFormContext<IntakeSubmitInput>();
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Editing</h2>
      <Field label="What do you need?" required htmlFor="editingType" error={errors.editingType?.message as string | undefined}>
        <Select id="editingType" {...register("editingType")}>
          <option value="">Select</option>
          <option value="Editing">Editing (grammar, clarity, flow)</option>
          <option value="Formatting">Formatting only (layout, structure)</option>
          <option value="Both">Both</option>
        </Select>
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Approx. page count" htmlFor="pageCount" error={errors.pageCount?.message as string | undefined}>
          <Input id="pageCount" type="number" inputMode="numeric" min={1} {...register("pageCount")} />
        </Field>
        <ReferencingField />
      </div>
      <DeadlineField />
      <p className="text-xs text-muted-foreground">
        Editing is priced per document — we&apos;ll confirm the amount once we see it.
      </p>
    </div>
  );
}

// ── Files step (shared) ──────────────────────────────────────

function FilesStep({ template, service }: { template: IntakeTemplate; service: ServiceProp }) {
  const { register } = useFormContext<IntakeSubmitInput>();
  const label =
    template === "academic_it"
      ? "Anything else we should know"
      : template === "design_presentation"
        ? "Content, references, or brand assets"
        : template === "editing"
          ? "Notes for the editor"
          : "Special instructions";

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Instructions</h2>
      <Field label={label} htmlFor="specialInstructions">
        <Textarea id="specialInstructions" rows={5} {...register("specialInstructions")} />
      </Field>
      <AttachmentsField
        id="att-docs"
        category="from_client"
        label={template === "editing" ? "Your document (file)" : "Documents and requirements (files)"}
        hint={
          template === "editing"
            ? "Upload the document you want edited or formatted"
            : "Lecturer instructions, an outline, existing work, or anything we should work from"
        }
      />
      {template !== "editing" ? <DeadlineField /> : null}
      {template === "design_presentation" ? <ExpressField service={service} /> : null}
    </div>
  );
}

// ── Review ───────────────────────────────────────────────────

function ReviewStep({
  template,
  service,
  price,
}: {
  template: IntakeTemplate;
  service: ServiceProp;
  price: ReturnType<typeof computePrice>;
}) {
  const {
    register,
    getValues,
    formState: { errors },
  } = useFormContext<IntakeSubmitInput>();
  const v = getValues();
  const proBono = React.useContext(ProBonoContext);
  const variablePrice = !proBono && service.pricingModel === "VARIABLE" && service.basePrice === 0;

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Review &amp; submit</h2>

      <dl className="divide-y divide-border/80 text-sm">
        <Row label="Service" value={service.serviceName} />
        <Row label="Name" value={v.fullName} />
        <Row label="Phone" value={v.phone} />
        {v.projectTitle ? <Row label="Topic" value={v.projectTitle} /> : null}
        {template === "career_cv" ? (
          <Row
            label="Entries"
            value={`${(v.education ?? []).filter((e) => e.degree || e.school).length} education, ${
              (v.experience ?? []).filter((e) => e.title || e.company).length
            } experience`}
          />
        ) : null}
        {template === "academic_it" && v.companyName ? <Row label="Company" value={v.companyName} /> : null}
        {template === "editing" && v.editingType ? <Row label="Service" value={v.editingType} /> : null}
        {service.variants?.length && v.serviceVariantId ? (
          <Row label="Option" value={service.variants.find((x) => x.id === v.serviceVariantId)?.name ?? ""} />
        ) : service.variants?.length ? (
          <Row label="Option" value={baseOptionLabel(service.variants)} />
        ) : null}
        {(v.attachments ?? []).length > 0 ? (
          <Row label="Files attached" value={String((v.attachments ?? []).length)} />
        ) : null}
        {v.clientDeadline ? <Row label="Needed by" value={v.clientDeadline} /> : null}
        {!proBono && template !== "editing" && template !== "career_cv" ? (
          <Row label="Express delivery" value={v.isExpressDelivery ? "Yes" : "No"} />
        ) : null}
        {v.referralCode ? <Row label="Referral code" value={v.referralCode} /> : null}
      </dl>

      {proBono ? null : (
      <div className="rounded-2xl bg-zone p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-foreground">Total price</span>
          <span className="font-mono font-semibold tabular-nums text-foreground">
            {variablePrice ? "Confirmed after review" : formatNaira(price.total)}
          </span>
        </div>
        {!variablePrice ? (
          <>
            <div className="mt-1 flex items-center justify-between text-muted-foreground">
              <span>Pay now (45% downpayment)</span>
              <span className="font-mono tabular-nums">{formatNaira(price.downpaymentAmount)}</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Balance after approval</span>
              <span className="font-mono tabular-nums">{formatNaira(price.balanceAmount)}</span>
            </div>
          </>
        ) : null}
      </div>
      )}

      <div className="rounded-xl bg-zone p-3.5 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">What happens next</p>
        <p className="mt-1">
          {proBono
            ? "There is nothing to pay. Once you submit, your project goes straight to our team. This link works once, so check your details before you send. Track progress any time with your project ID."
            : variablePrice
            ? "We confirm your details on WhatsApp and send payment instructions. Work begins once your downpayment is verified. Track progress any time with your project ID."
            : "You'll be taken to Paystack to pay the downpayment. Your project is only created once payment succeeds — you won't need to submit again. Track progress any time with your project ID."}
        </p>
      </div>

      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" {...register("agreeTerms")} />
        <span>
          {proBono
            ? "I agree to EduCraft's terms: up to 3 rounds of revisions within scope."
            : `I agree to EduCraft's terms: ${variablePrice ? "a" : "45%"} downpayment to begin, balance on approval, and up to 3 rounds of revisions within scope.`}
        </span>
      </label>
      {errors.agreeTerms ? <p className="text-xs text-danger">{errors.agreeTerms.message as string}</p> : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-[60%] text-right text-foreground">{value || "—"}</dd>
    </div>
  );
}
