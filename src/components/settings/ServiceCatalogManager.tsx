"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Loader2, Plus, Pencil } from "lucide-react";
import { LuLayers, LuPackage } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/forms/Field";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/intake-templates";
import { createServiceSchema, updateServiceSchema } from "@/lib/validations/settings";
import type { CreateServiceInput } from "@/lib/validations/settings";
import type { ServiceRow } from "@/lib/services/service-catalog";
import { formatNaira } from "@/lib/utils";

/** Shared shape the form works with — a superset of create/update inputs. */
type ServiceFormValues = Omit<CreateServiceInput, "serviceCode"> & {
  serviceCode?: string;
  isActive?: boolean;
};

const PRICING_MODELS = [
  { value: "FIXED", label: "Fixed" },
  { value: "VARIABLE", label: "Variable (priced per order)" },
  { value: "QUOTE", label: "Quote only" },
] as const;

export function ServiceCatalogManager({
  services,
  canManage,
}: {
  services: ServiceRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ServiceRow | null>(null);

  const grouped = React.useMemo(() => {
    const byCat = new Map<string, ServiceRow[]>();
    for (const s of services) {
      const list = byCat.get(s.category) ?? [];
      list.push(s);
      byCat.set(s.category, list);
    }
    return CATEGORY_ORDER.map((cat) => ({ cat, rows: byCat.get(cat) ?? [] })).filter(
      (g) => g.rows.length > 0
    );
  }, [services]);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(row: ServiceRow) {
    setEditing(row);
    setDialogOpen(true);
  }
  function close(refresh: boolean) {
    setDialogOpen(false);
    setEditing(null);
    if (refresh) router.refresh();
  }

  return (
    <div className="space-y-6">
      {canManage ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" aria-hidden />
            Add service
          </Button>
        </div>
      ) : null}

      {services.length === 0 ? (
        <EmptyState
          icon={LuPackage}
          title="No services yet"
          description="Add the first service clients can order."
        />
      ) : null}

      {grouped.map(({ cat, rows }) => (
        <div key={cat}>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <LuLayers className="size-3.5" aria-hidden />
            {CATEGORY_LABELS[cat] ?? cat}
          </h3>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {rows.map((s) => (
              <div key={s.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{s.serviceName}</p>
                    <p className="font-mono text-xs text-muted-foreground">{s.serviceCode}</p>
                  </div>
                  <Badge variant={s.isActive ? "success" : "neutral"}>
                    {s.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="font-mono tabular-nums text-foreground">
                    {s.pricingModel === "FIXED" ? formatNaira(s.basePrice) : PRICING_MODELS.find((p) => p.value === s.pricingModel)?.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{s.downpaymentPercentage}% down</span>
                </div>
                {canManage ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 w-full"
                    onClick={() => openEdit(s)}
                  >
                    <Pencil className="size-4" aria-hidden />
                    Edit
                  </Button>
                ) : null}
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Service</th>
                  <th className="px-4 py-2.5 font-medium">Price</th>
                  <th className="px-4 py-2.5 font-medium">Downpayment</th>
                  <th className="px-4 py-2.5 font-medium">Days</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  {canManage ? <th className="px-4 py-2.5 font-medium" /> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{s.serviceName}</p>
                      <p className="font-mono text-xs text-muted-foreground">{s.serviceCode}</p>
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-foreground">
                      {s.pricingModel === "FIXED"
                        ? formatNaira(s.basePrice)
                        : PRICING_MODELS.find((p) => p.value === s.pricingModel)?.label}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-muted-foreground">
                      {s.downpaymentPercentage}%
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-muted-foreground">
                      {s.estimatedDays}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={s.isActive ? "success" : "neutral"}>
                        {s.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    {canManage ? (
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>
                          <Pencil className="size-4" aria-hidden />
                          Edit
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <Dialog open={dialogOpen} onOpenChange={(o) => !o && close(false)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {dialogOpen ? (
            <ServiceForm
              key={editing?.id ?? "new"}
              initial={editing}
              onDone={() => close(true)}
              onCancel={() => close(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ServiceForm({
  initial,
  onDone,
  onCancel,
}: {
  initial: ServiceRow | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const isEdit = initial !== null;
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ServiceFormValues>({
    resolver: zodResolver(isEdit ? updateServiceSchema : createServiceSchema) as Resolver<ServiceFormValues>,
    defaultValues: isEdit
      ? {
          serviceName: initial.serviceName,
          category: initial.category,
          basePrice: initial.basePrice,
          pricingModel: initial.pricingModel,
          intakeFormTemplate: initial.intakeFormTemplate,
          estimatedDays: initial.estimatedDays,
          requiresDownpayment: initial.requiresDownpayment,
          downpaymentPercentage: initial.downpaymentPercentage,
          description: initial.description ?? "",
          deliverables: initial.deliverables ?? "",
          expressDeliverySurcharge: initial.expressDeliverySurcharge ?? undefined,
          sortOrder: initial.sortOrder,
          isActive: initial.isActive,
        }
      : {
          serviceCode: "",
          serviceName: "",
          category: "ACADEMIC",
          basePrice: 0,
          pricingModel: "FIXED",
          intakeFormTemplate: "",
          estimatedDays: 7,
          requiresDownpayment: true,
          downpaymentPercentage: 45,
          description: "",
          deliverables: "",
          sortOrder: 0,
        },
  });

  const onSubmit = async (data: ServiceFormValues) => {
    setSubmitError(null);
    try {
      const res = await fetch(
        isEdit ? `/api/admin/settings/services/${initial!.id}` : "/api/admin/settings/services",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "That could not be saved.");
      }
      onDone();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "That could not be saved.");
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? `Edit ${initial.serviceName}` : "Add a service"}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Changes apply to new orders — projects already priced keep their original figures."
            : "New services start active and appear immediately on /services and /intake."}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {!isEdit ? (
            <Field
              label="Service code"
              required
              htmlFor="serviceCode"
              error={errors.serviceCode?.message}
              hint="Unique, e.g. FYP-FULL"
            >
              <Input id="serviceCode" autoComplete="off" className="font-mono uppercase" {...register("serviceCode")} />
            </Field>
          ) : null}
          <Field label="Name" required htmlFor="serviceName" error={errors.serviceName?.message}>
            <Input id="serviceName" {...register("serviceName")} />
          </Field>
          <Field label="Category" required htmlFor="category" error={errors.category?.message}>
            <Select id="category" {...register("category")}>
              {CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c] ?? c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Pricing model" htmlFor="pricingModel" error={errors.pricingModel?.message}>
            <Select id="pricingModel" {...register("pricingModel")}>
              {PRICING_MODELS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Base price (₦)" required htmlFor="basePrice" error={errors.basePrice?.message}>
            <Input id="basePrice" type="number" inputMode="numeric" min={0} {...register("basePrice")} />
          </Field>
          <Field label="Estimated days" required htmlFor="estimatedDays" error={errors.estimatedDays?.message}>
            <Input id="estimatedDays" type="number" inputMode="numeric" min={1} max={180} {...register("estimatedDays")} />
          </Field>
          <Field
            label="Downpayment %"
            required
            htmlFor="downpaymentPercentage"
            error={errors.downpaymentPercentage?.message}
            hint="Overrides the general default for this service"
          >
            <Input
              id="downpaymentPercentage"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              {...register("downpaymentPercentage")}
            />
          </Field>
          <Field
            label="Express surcharge (₦)"
            htmlFor="expressDeliverySurcharge"
            error={errors.expressDeliverySurcharge?.message}
            hint="Leave blank if not offered"
          >
            <Input
              id="expressDeliverySurcharge"
              type="number"
              inputMode="numeric"
              min={0}
              {...register("expressDeliverySurcharge")}
            />
          </Field>
        </div>

        <Field
          label="Intake form template"
          required
          htmlFor="intakeFormTemplate"
          error={errors.intakeFormTemplate?.message}
          hint="e.g. academic_fyp, academic_termpaper, career_cv, design_presentation, editing — unmatched values finish on WhatsApp"
        >
          <Input id="intakeFormTemplate" autoComplete="off" {...register("intakeFormTemplate")} />
        </Field>

        <Field label="Description" htmlFor="description" error={errors.description?.message}>
          <textarea
            id="description"
            rows={2}
            className="w-full rounded-lg border border-border bg-input p-3 text-sm text-foreground placeholder:text-subtle focus-visible:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            {...register("description")}
          />
        </Field>
        <Field label="Deliverables" htmlFor="deliverables" error={errors.deliverables?.message}>
          <textarea
            id="deliverables"
            rows={2}
            className="w-full rounded-lg border border-border bg-input p-3 text-sm text-foreground placeholder:text-subtle focus-visible:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            {...register("deliverables")}
          />
        </Field>

        <div className="flex flex-wrap gap-6">
          <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
            <input type="checkbox" className="size-4 shrink-0 accent-primary" {...register("requiresDownpayment")} />
            Requires downpayment
          </label>
          {isEdit ? (
            <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
              <input type="checkbox" className="size-4 shrink-0 accent-primary" {...register("isActive")} />
              Active (visible to clients)
            </label>
          ) : null}
        </div>

        {submitError ? (
          <p className="flex items-start gap-2 text-sm text-danger">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {submitError}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {isEdit ? "Save changes" : "Add service"}
          </Button>
        </div>
      </form>
    </>
  );
}
