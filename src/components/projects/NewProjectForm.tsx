"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, FormProvider, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  LuCheck as Check,
  LuCircleAlert as CircleAlert,
  LuLoaderCircle as Loader2,
  LuSearch as Search,
  LuX as X,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/Field";
import { FormActions } from "@/components/forms/FormActions";
import { UniversityCombobox } from "@/components/forms/UniversityCombobox";
import {
  AmbassadorPicker,
  CommissionPreview,
  CommissionRatePicker,
} from "@/components/ambassadors/CommissionPickers";
import { EmailToggle } from "@/components/projects/AmbassadorAllocation";
import { createProjectSchema, type CreateProjectInput } from "@/lib/validations/projects";
import { ACADEMIC_LEVELS, PROJECT_TYPES, REFERENCING_STYLES } from "@/lib/constants";
import { COMMISSION_RATES, commissionFor } from "@/lib/commission";
import { computePrice, computeSplit } from "@/lib/pricing";
import type { AllocatableAmbassador } from "@/lib/services/ambassador-commission";
import { cn, formatNaira } from "@/lib/utils";

interface UniversityOption {
  id: string;
  name: string;
  abbreviation: string;
}

interface ServiceOption {
  id: string;
  serviceName: string;
  basePrice: number;
  pricingModel: string;
  estimatedDays: number;
  intakeFormTemplate: string;
  expressDeliverySurcharge: number | null;
  variants: { id: string; name: string; priceAddon: number }[];
}

interface ClientHit {
  id: string;
  clientId: string;
  fullName: string;
  phone: string;
  department: string;
  university: string | null;
}

const STEPS = ["Client", "Service", "Details", "Review"] as const;

const isFyp = (t: string) => t.startsWith("academic_fyp");
const isTermPaper = (t: string) => t === "academic_termpaper";

function priceFor(
  service: ServiceOption | null,
  variantId: string | undefined | null,
  isExpress: boolean,
  override: number | string | undefined | null
) {
  if (!service) return null;
  const variant = service.variants.find((v) => v.id === variantId) ?? null;
  const overrideNum =
    override === "" || override == null ? null : Number(override);
  return computePrice({
    basePrice: service.basePrice,
    variantAddon: variant?.priceAddon ?? 0,
    expressSurcharge: service.expressDeliverySurcharge ?? 0,
    isExpressDelivery: isExpress,
    override: Number.isFinite(overrideNum) ? overrideNum : null,
  });
}

// ── Root ─────────────────────────────────────────────────────

export function NewProjectForm({
  universities,
  services,
  ambassadors,
}: {
  universities: UniversityOption[];
  services: ServiceOption[];
  ambassadors: AllocatableAmbassador[];
}) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const form = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    mode: "onBlur",
    defaultValues: {
      clientMode: "new",
      clientId: "",
      fullName: "",
      phone: "",
      email: "",
      universityId: "",
      faculty: "",
      department: "",
      level: "",
      referralCode: "",
      ambassadorId: "",
      ambassadorRate: undefined,
      notifyAmbassador: true,
      serviceId: "",
      serviceVariantId: "",
      isExpressDelivery: false,
      projectTitle: "",
      matricNumber: "",
      supervisorName: "",
      hodName: "",
      referencingStyle: "",
      minimumPages: "",
      projectType: "",
      courseTitle: "",
      courseCode: "",
      specialInstructions: "",
      clientDeadline: "",
    },
  });

  const { watch, trigger, handleSubmit, getValues, setValue } = form;
  const clientMode = watch("clientMode");
  const serviceId = watch("serviceId");
  const service = services.find((s) => s.id === serviceId) ?? null;

  const stepFields = (): (keyof CreateProjectInput)[] => {
    switch (step) {
      case 0:
        return clientMode === "existing"
          ? ["clientId"]
          : ["fullName", "phone", "email", "universityId", "faculty", "department", "level"];
      case 1:
        return ["serviceId", "serviceVariantId", "isExpressDelivery", "priceOverride", "ambassadorId", "ambassadorRate"];
      case 2:
        return [
          "projectTitle",
          ...(service && isFyp(service.intakeFormTemplate)
            ? ([
                "matricNumber",
                "supervisorName",
                "hodName",
                "referencingStyle",
                "minimumPages",
                "projectType",
                "chapterCount",
              ] as (keyof CreateProjectInput)[])
            : []),
          ...(service && isTermPaper(service.intakeFormTemplate)
            ? (["courseTitle", "courseCode", "wordCount"] as (keyof CreateProjectInput)[])
            : []),
          "specialInstructions",
          "clientDeadline",
        ];
      default:
        return [];
    }
  };

  async function next() {
    setSubmitError(null);
    const ok = await trigger(stepFields(), { shouldFocus: true });
    if (ok) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setSubmitError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  const onSubmit = async (data: CreateProjectInput) => {
    setSubmitError(null);
    try {
      const res = await fetch("/api/admin/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = (await res.json().catch(() => null)) as
        | { projectId?: string; error?: string }
        | null;
      if (!res.ok || !body?.projectId) {
        throw new Error(body?.error ?? "Could not create the project.");
      }
      router.push(`/admin/projects/${body.projectId}`);
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not create the project.");
    }
  };

  const isSubmitting = form.formState.isSubmitting;

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-w-3xl space-y-9">
        <Stepper step={step} />

        {/* Each step sits on the page; its heading organises it. */}
        <div>
          {step === 0 && (
            <ClientStep universities={universities} clientMode={clientMode} setValue={setValue} />
          )}
          {step === 1 && <ServiceStep services={services} ambassadors={ambassadors} />}
          {step === 2 && <DetailsStep service={service} />}
          {step === 3 && (
            <ReviewStep
              universities={universities}
              services={services}
              ambassadors={ambassadors}
              values={getValues()}
            />
          )}
        </div>

        {submitError ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-danger">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {submitError}
          </p>
        ) : null}

        <FormActions className="justify-between">
          <Button type="button" variant="ghost" onClick={back} disabled={step === 0 || isSubmitting}>
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={next}>
              Continue
            </Button>
          ) : (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {isSubmitting ? "Creating…" : "Create project"}
            </Button>
          )}
        </FormActions>
      </form>
    </FormProvider>
  );
}

// ── Stepper ──────────────────────────────────────────────────

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((label, i) => {
        const state = i < step ? "done" : i === step ? "current" : "upcoming";
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-medium",
                state === "done" && "bg-primary text-primary-foreground",
                state === "current" && "bg-primary/15 text-primary",
                state === "upcoming" && "bg-zone text-muted-foreground"
              )}
            >
              {state === "done" ? <Check className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <span
              className={cn(
                "hidden text-xs font-medium sm:block",
                state === "upcoming" ? "text-muted-foreground" : "text-foreground"
              )}
            >
              {label}
            </span>
            {i < STEPS.length - 1 ? (
              <span className={cn("h-px flex-1", i < step ? "bg-primary" : "bg-border")} aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

// ── Step 1: Client ───────────────────────────────────────────

function ClientStep({
  universities,
  clientMode,
  setValue,
}: {
  universities: UniversityOption[];
  clientMode: string;
  setValue: ReturnType<typeof useFormContext<CreateProjectInput>>["setValue"];
}) {
  const {
    register,
    watch,
    control,
    formState: { errors },
  } = useFormContext<CreateProjectInput>();

  const selectedClientId = watch("clientId");
  const [picked, setPicked] = React.useState<ClientHit | null>(null);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Client information</h2>

      <div role="group" aria-label="Client type" className="inline-flex w-full gap-1 rounded-xl bg-zone p-1 sm:w-auto">
        <ModeButton active={clientMode === "new"} onClick={() => setValue("clientMode", "new")}>
          New client
        </ModeButton>
        <ModeButton
          active={clientMode === "existing"}
          onClick={() => setValue("clientMode", "existing")}
        >
          Existing client
        </ModeButton>
      </div>

      {clientMode === "existing" ? (
        <ClientPicker
          picked={picked}
          selectedId={selectedClientId || undefined}
          error={errors.clientId?.message}
          onPick={(hit) => {
            setPicked(hit);
            setValue("clientId", hit.id, { shouldValidate: true });
          }}
          onClear={() => {
            setPicked(null);
            setValue("clientId", "", { shouldValidate: true });
          }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name" required htmlFor="c-fullName" error={errors.fullName?.message}>
            <Input id="c-fullName" autoComplete="off" {...register("fullName")} />
          </Field>
          <Field label="Phone" required htmlFor="c-phone" error={errors.phone?.message}>
            <Input id="c-phone" inputMode="tel" autoComplete="off" {...register("phone")} />
          </Field>
          <Field label="Email" htmlFor="c-email" error={errors.email?.message}>
            <Input id="c-email" type="email" inputMode="email" autoComplete="off" {...register("email")} />
          </Field>
          <Field label="University" required htmlFor="c-uni" error={errors.universityId?.message}>
            <Controller
              control={control}
              name="universityId"
              render={({ field }) => (
                <UniversityCombobox
                  id="c-uni"
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
          <Field label="Faculty" htmlFor="c-faculty" error={errors.faculty?.message}>
            <Input id="c-faculty" {...register("faculty")} />
          </Field>
          <Field label="Department" required htmlFor="c-dept" error={errors.department?.message}>
            <Input id="c-dept" {...register("department")} />
          </Field>
          <Field label="Level" required htmlFor="c-level" error={errors.level?.message}>
            <Select id="c-level" {...register("level")}>
              <option value="">Select a level</option>
              {ACADEMIC_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-11 flex-1 rounded-lg px-4 text-sm font-medium transition-colors sm:flex-none",
        active ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function ClientPicker({
  picked,
  selectedId,
  onPick,
  onClear,
  error,
}: {
  picked: ClientHit | null;
  selectedId?: string;
  onPick: (hit: ClientHit) => void;
  onClear: () => void;
  error?: string;
}) {
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<ClientHit[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (picked || q.trim().length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/clients?q=${encodeURIComponent(q.trim())}`);
        const data = (await res.json()) as { clients: ClientHit[] };
        setHits(data.clients ?? []);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, picked]);

  if (picked && selectedId) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-zone p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{picked.fullName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {picked.clientId} · {picked.phone} · {picked.university ?? "—"}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          <X className="size-4" aria-hidden />
          Change
        </Button>
      </div>
    );
  }

  return (
    <Field
      label="Find client"
      htmlFor="client-search"
      error={error}
      hint="Search by name, phone, or client ID"
    >
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
          aria-hidden
        />
        <Input
          id="client-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Start typing a name…"
          className="pl-9"
          autoComplete="off"
        />
      </div>
      {loading ? (
        <p className="mt-2 text-xs text-muted-foreground">Searching…</p>
      ) : hits.length > 0 ? (
        <ul className="mt-2 divide-y divide-border/80">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => onPick(hit)}
                className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none"
              >
                <span className="min-w-0">
                  <span className="block text-sm text-foreground">{hit.fullName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {hit.clientId} · {hit.phone} · {hit.university ?? "—"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : q.trim().length >= 2 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          No match. Switch to &ldquo;New client&rdquo; to add them.
        </p>
      ) : null}
    </Field>
  );
}

// ── Step 2: Service ──────────────────────────────────────────

function ServiceStep({
  services,
  ambassadors,
}: {
  services: ServiceOption[];
  ambassadors: AllocatableAmbassador[];
}) {
  const {
    register,
    watch,
    formState: { errors },
  } = useFormContext<CreateProjectInput>();

  const serviceId = watch("serviceId");
  const variantId = watch("serviceVariantId");
  const isExpress = watch("isExpressDelivery");
  const override = watch("priceOverride");
  const service = services.find((s) => s.id === serviceId) ?? null;

  const price = priceFor(service, variantId, Boolean(isExpress), override as number | string | undefined);

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Service selection</h2>

      <Field label="Service" required htmlFor="serviceId" error={errors.serviceId?.message}>
        <Select id="serviceId" {...register("serviceId")}>
          <option value="">Select a service</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.serviceName} — {formatNaira(s.basePrice)}
            </option>
          ))}
        </Select>
      </Field>

      {service && service.variants.length > 0 ? (
        <Field label="Variant" htmlFor="variant" error={errors.serviceVariantId?.message}>
          <Select id="variant" {...register("serviceVariantId")}>
            <option value="">Standard (no add-on)</option>
            {service.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} (+{formatNaira(v.priceAddon)})
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {service ? (
        <label className="flex items-start gap-3 rounded-xl bg-zone p-3.5">
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 accent-primary"
            {...register("isExpressDelivery")}
          />
          <span className="text-sm">
            <span className="font-medium text-foreground">Express delivery</span>
            <span className="block text-xs text-muted-foreground">
              {service.expressDeliverySurcharge
                ? `Adds ${formatNaira(service.expressDeliverySurcharge)}, faster turnaround`
                : "No express surcharge configured for this service"}
            </span>
          </span>
        </label>
      ) : null}

      {service ? (
        <Field
          label="Price override"
          htmlFor="priceOverride"
          error={errors.priceOverride?.message as string | undefined}
          hint={
            service.pricingModel === "FIXED"
              ? "Leave blank to use the calculated price"
              : "This service has variable pricing — set the agreed total"
          }
        >
          <Input
            id="priceOverride"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder={price ? String(price.total) : ""}
            {...register("priceOverride")}
          />
        </Field>
      ) : null}

      {price ? (
        <div className="rounded-2xl bg-zone p-4 text-sm">
          <PriceRow label="Base price" value={price.base} />
          {price.variantAddon > 0 ? <PriceRow label="Variant add-on" value={price.variantAddon} /> : null}
          {price.expressSurcharge > 0 ? (
            <PriceRow label="Express delivery" value={price.expressSurcharge} />
          ) : null}
          <div className="my-2 h-px bg-border" />
          <PriceRow label="Total" value={price.total} strong />
          <PriceRow label="Downpayment (45%)" value={price.downpaymentAmount} muted />
          <PriceRow label="Balance (55%)" value={price.balanceAmount} muted />
          {price.overridden ? (
            <p className="mt-2 text-xs text-gold">Manual price override in effect.</p>
          ) : null}
        </div>
      ) : null}

      {price ? <AmbassadorSection ambassadors={ambassadors} total={price.total} /> : null}
    </div>
  );
}

/**
 * Who referred this job — None, or an ambassador at 10/12/15% or any rate the
 * admin sets. Their commission comes off the price and is logged as an
 * expense when the project is created.
 */
function AmbassadorSection({
  ambassadors,
  total,
}: {
  ambassadors: AllocatableAmbassador[];
  total: number;
}) {
  const {
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<CreateProjectInput>();

  const ambassadorId = watch("ambassadorId") || null;
  const rate = watch("ambassadorRate");
  const notify = watch("notifyAmbassador");
  const selected = ambassadors.find((a) => a.id === ambassadorId) ?? null;
  const effectiveRate = typeof rate === "number" ? rate : (selected?.tierRate ?? COMMISSION_RATES[0]);

  return (
    <section className="space-y-4 pt-5">
      <div>
        <h3 className="text-[15px] font-semibold text-foreground">Ambassador</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Who referred this client? Their commission comes off the job price and is logged as an
          expense.
        </p>
      </div>

      <AmbassadorPicker
        ambassadors={ambassadors}
        selectedId={ambassadorId}
        allowNone
        onPick={(a) => {
          setValue("ambassadorId", a?.id ?? "", { shouldDirty: true });
          setValue("ambassadorRate", a ? a.tierRate : undefined, { shouldDirty: true });
          setValue("notifyAmbassador", Boolean(a?.email), { shouldDirty: true });
        }}
      />

      {selected ? (
        <>
          <CommissionRatePicker
            id="new-project-rate"
            value={effectiveRate}
            onChange={(r) => setValue("ambassadorRate", r, { shouldValidate: true, shouldDirty: true })}
          />
          {errors.ambassadorRate?.message ? (
            <p className="text-xs text-danger">{errors.ambassadorRate.message as string}</p>
          ) : null}
          <CommissionPreview
            price={total}
            workerPayout={computeSplit(total, null).workerPayout}
            rate={effectiveRate}
            parent={selected.parent}
          />
          <EmailToggle
            ambassador={selected}
            checked={Boolean(notify)}
            onChange={(v) => setValue("notifyAmbassador", v)}
            downpaymentVerified={false}
          />
        </>
      ) : null}
    </section>
  );
}

function PriceRow({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: number;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span
        className={cn(
          strong ? "font-semibold text-foreground" : muted ? "text-muted-foreground" : "text-foreground"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "font-mono tabular-nums",
          strong ? "font-semibold text-foreground" : muted ? "text-muted-foreground" : "text-foreground"
        )}
      >
        {formatNaira(value)}
      </span>
    </div>
  );
}

// ── Step 3: Details ──────────────────────────────────────────

function DetailsStep({ service }: { service: ServiceOption | null }) {
  const {
    register,
    formState: { errors },
  } = useFormContext<CreateProjectInput>();

  const fyp = service ? isFyp(service.intakeFormTemplate) : false;
  const termPaper = service ? isTermPaper(service.intakeFormTemplate) : false;

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Project details</h2>

      <Field
        label="Project title"
        required
        htmlFor="projectTitle"
        error={errors.projectTitle?.message}
      >
        <Input id="projectTitle" {...register("projectTitle")} />
      </Field>

      {fyp ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Matric number" htmlFor="matricNumber">
            <Input id="matricNumber" {...register("matricNumber")} />
          </Field>
          <Field label="Supervisor" htmlFor="supervisorName">
            <Input id="supervisorName" {...register("supervisorName")} />
          </Field>
          <Field label="Head of department" htmlFor="hodName">
            <Input id="hodName" {...register("hodName")} />
          </Field>
          <Field label="Referencing style" htmlFor="referencingStyle">
            <Select id="referencingStyle" {...register("referencingStyle")}>
              <option value="">Not specified</option>
              {REFERENCING_STYLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Minimum pages" htmlFor="minimumPages">
            <Input id="minimumPages" {...register("minimumPages")} />
          </Field>
          <Field label="Project type" htmlFor="projectType">
            <Select id="projectType" {...register("projectType")}>
              <option value="">Not specified</option>
              {PROJECT_TYPES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Chapter count"
            htmlFor="chapterCount"
            error={errors.chapterCount?.message as string | undefined}
          >
            <Input
              id="chapterCount"
              type="number"
              inputMode="numeric"
              min={1}
              max={20}
              {...register("chapterCount")}
            />
          </Field>
        </div>
      ) : null}

      {termPaper ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Course title" htmlFor="courseTitle">
            <Input id="courseTitle" {...register("courseTitle")} />
          </Field>
          <Field label="Course code" htmlFor="courseCode">
            <Input id="courseCode" {...register("courseCode")} />
          </Field>
          <Field
            label="Word count"
            htmlFor="wordCount"
            error={errors.wordCount?.message as string | undefined}
          >
            <Input id="wordCount" type="number" inputMode="numeric" min={1} {...register("wordCount")} />
          </Field>
        </div>
      ) : null}

      <Field label="Special instructions" htmlFor="specialInstructions">
        <Textarea id="specialInstructions" rows={4} {...register("specialInstructions")} />
      </Field>

      <Field
        label="Client deadline"
        htmlFor="clientDeadline"
        error={errors.clientDeadline?.message as string | undefined}
        hint={service ? `Standard turnaround is about ${service.estimatedDays} days` : undefined}
      >
        <Input id="clientDeadline" type="date" {...register("clientDeadline")} />
      </Field>

      <p className="text-xs text-muted-foreground">
        Files are added from the project page once it exists.
      </p>
    </div>
  );
}

// ── Step 4: Review ───────────────────────────────────────────

function ReviewStep({
  universities,
  services,
  ambassadors,
  values,
}: {
  universities: UniversityOption[];
  services: ServiceOption[];
  ambassadors: AllocatableAmbassador[];
  values: CreateProjectInput;
}) {
  const ambassador = ambassadors.find((a) => a.id === values.ambassadorId) ?? null;
  const ambassadorRate =
    ambassador ? (typeof values.ambassadorRate === "number" ? values.ambassadorRate : ambassador.tierRate) : null;
  const service = services.find((s) => s.id === values.serviceId) ?? null;
  const variant = service?.variants.find((v) => v.id === values.serviceVariantId) ?? null;
  const price = priceFor(
    service,
    values.serviceVariantId,
    Boolean(values.isExpressDelivery),
    values.priceOverride as number | string | undefined
  );

  const uniName =
    values.clientMode === "new"
      ? universities.find((u) => u.id === values.universityId)?.name ?? "—"
      : null;

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Review</h2>

      <ReviewGroup title="Client">
        {values.clientMode === "existing" ? (
          <ReviewRow label="Existing client" value={values.clientId ? "Selected" : "Not selected"} />
        ) : (
          <>
            <ReviewRow label="Name" value={values.fullName || "—"} />
            <ReviewRow label="Phone" value={values.phone || "—"} />
            {values.email ? <ReviewRow label="Email" value={values.email} /> : null}
            <ReviewRow label="University" value={uniName ?? "—"} />
            <ReviewRow label="Department" value={values.department || "—"} />
            <ReviewRow label="Level" value={values.level || "—"} />
          </>
        )}
      </ReviewGroup>

      <ReviewGroup title="Ambassador">
        {ambassador && ambassadorRate != null ? (
          <>
            <ReviewRow label="Referred by" value={`${ambassador.name} (${ambassador.code})`} />
            <ReviewRow label="Commission rate" value={`${ambassadorRate}%`} />
            <ReviewRow
              label="Email"
              value={
                ambassador.email
                  ? values.notifyAmbassador
                    ? `Now, to ${ambassador.email}`
                    : "When the downpayment is verified"
                  : "No email on file"
              }
            />
            {ambassador.parent ? (
              <ReviewRow
                label="Parent commission"
                value={`${ambassador.parent.rate}% to ${ambassador.parent.name}`}
              />
            ) : null}
          </>
        ) : (
          <ReviewRow label="Referred by" value="None" />
        )}
      </ReviewGroup>

      <ReviewGroup title="Service">
        <ReviewRow label="Service" value={service?.serviceName ?? "—"} />
        {variant ? <ReviewRow label="Variant" value={variant.name} /> : null}
        <ReviewRow label="Express delivery" value={values.isExpressDelivery ? "Yes" : "No"} />
      </ReviewGroup>

      <ReviewGroup title="Project">
        <ReviewRow label="Title" value={values.projectTitle || "—"} />
        {values.supervisorName ? <ReviewRow label="Supervisor" value={values.supervisorName} /> : null}
        {values.courseCode ? <ReviewRow label="Course code" value={values.courseCode} /> : null}
        {values.clientDeadline ? <ReviewRow label="Client deadline" value={values.clientDeadline} /> : null}
        {values.specialInstructions ? (
          <ReviewRow label="Instructions" value={values.specialInstructions} />
        ) : null}
      </ReviewGroup>

      {price ? (
        <div className="rounded-2xl bg-zone p-4 text-sm">
          <PriceRow label="Total price" value={price.total} strong />
          <PriceRow label="Downpayment (45%)" value={price.downpaymentAmount} muted />
          <PriceRow label="Balance (55%)" value={price.balanceAmount} muted />
          {ambassadorRate != null ? (
            <>
              <div className="my-2 h-px bg-border" />
              <PriceRow
                label={`Ambassador commission (${ambassadorRate}%)`}
                value={commissionFor(price.total, ambassadorRate)}
                muted
              />
              {ambassador?.parent ? (
                <PriceRow
                  label={`Parent commission (${ambassador.parent.rate}%)`}
                  value={commissionFor(price.total, ambassador.parent.rate)}
                  muted
                />
              ) : null}
              <PriceRow
                label="EduCraft keeps after worker and commission"
                value={
                  price.total -
                  computeSplit(price.total, null).workerPayout -
                  commissionFor(price.total, ambassadorRate) -
                  (ambassador?.parent ? commissionFor(price.total, ambassador.parent.rate) : 0)
                }
              />
            </>
          ) : null}
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Creating the project opens it at NEW. Verify the downpayment from the project page to move it
        forward.
      </p>
    </div>
  );
}

function ReviewGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="meta-label">
        {title}
      </h3>
      <dl className="mt-1.5 divide-y divide-border/80">{children}</dl>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-[60%] whitespace-pre-wrap text-right text-foreground">{value}</dd>
    </div>
  );
}
