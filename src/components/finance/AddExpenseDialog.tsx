"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LuCircleAlert, LuLoaderCircle, LuPlus } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/forms/Field";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { BUCKET_META, FINANCE_DEFAULTS } from "@/lib/finance/commission-config";
import {
  createExpenseSchema,
  DEFAULT_BUCKET_FOR_CATEGORY,
  DEFAULT_POT_FOR_CATEGORY,
  EXPENSE_BUCKETS,
  EXPENSE_CATEGORIES,
  EXPENSE_FREQUENCIES,
  type CreateExpenseInput,
} from "@/lib/validations/expenses";
import type { PotView } from "@/lib/services/finance/pots";
import { formatNaira } from "@/lib/utils";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AddExpenseDialog({ isFounder, pots }: { isFounder: boolean; pots: PotView[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <LuPlus className="size-4" aria-hidden />
        Add expense
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          {open ? (
            <ExpenseForm
              isFounder={isFounder}
              pots={pots}
              onDone={() => {
                setOpen(false);
                router.refresh();
              }}
              onCancel={() => setOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ExpenseForm({ isFounder, pots, onDone, onCancel }: { isFounder: boolean; pots: PotView[]; onDone: () => void; onCancel: () => void }) {
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateExpenseInput>({
    resolver: zodResolver(createExpenseSchema),
    defaultValues: {
      category: "Software",
      bucketSource: "OPERATIONS_RESERVE",
      potKey: "",
      description: "",
      amount: undefined,
      date: today(),
      recurring: false,
      frequency: "",
    },
  });

  const recurring = watch("recurring");
  const category = watch("category");
  const bucketSource = watch("bucketSource");
  const potKey = watch("potKey");
  const amount = watch("amount");
  const needsApproval = !isFounder && Number(amount) > FINANCE_DEFAULTS.expenseApprovalThreshold;

  // Pots that live inside the chosen bucket (Operations Reserve holds them in v1).
  const bucketPots = React.useMemo(() => pots.filter((p) => p.parentKey === bucketSource), [pots, bucketSource]);

  // The category chooses the bucket it is normally paid from; the admin may still change it.
  React.useEffect(() => {
    if (category) setValue("bucketSource", DEFAULT_BUCKET_FOR_CATEGORY[category]);
  }, [category, setValue]);

  // Pre-select the category's usual pot when it exists in the chosen bucket; otherwise clear it.
  React.useEffect(() => {
    const preferred = DEFAULT_POT_FOR_CATEGORY[category as keyof typeof DEFAULT_POT_FOR_CATEGORY];
    if (preferred && bucketPots.some((p) => p.key === preferred)) setValue("potKey", preferred);
    else if (potKey && !bucketPots.some((p) => p.key === potKey)) setValue("potKey", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, bucketSource, bucketPots, setValue]);

  const onSubmit = async (data: CreateExpenseInput) => {
    setSubmitError(null);
    try {
      const res = await fetch("/api/admin/finance/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not add this expense.");
      }
      onDone();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not add this expense.");
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add an expense</DialogTitle>
        <DialogDescription>Paid from one of the buckets. Logged against the business, not any single project.</DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Category" required htmlFor="category" error={errors.category?.message}>
            <Select id="category" {...register("category")}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Paid from" required htmlFor="bucketSource" error={errors.bucketSource?.message}>
            <Select id="bucketSource" {...register("bucketSource")}>
              {EXPENSE_BUCKETS.map((b) => (
                <option key={b} value={b}>
                  {BUCKET_META[b].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {bucketPots.length > 0 ? (
          <Field
            label="Pot"
            htmlFor="potKey"
            error={errors.potKey?.message}
            hint="Earmarked cash inside this bucket. Leave as general if it is not from a pot."
          >
            <Select id="potKey" {...register("potKey")}>
              <option value="">No pot — general expense</option>
              {bucketPots.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label} ({formatNaira(p.balance)})
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field label="Description" required htmlFor="description" error={errors.description?.message}>
          <Input id="description" autoComplete="off" {...register("description")} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Amount (₦)"
            required
            htmlFor="amount"
            error={errors.amount?.message}
            hint={needsApproval ? `Over ${formatNaira(FINANCE_DEFAULTS.expenseApprovalThreshold)}: waits for the founder's approval` : undefined}
          >
            <Input id="amount" type="number" inputMode="numeric" min={0} {...register("amount")} />
          </Field>
          <Field label="Date" required htmlFor="date" error={errors.date?.message}>
            <Input id="date" type="date" {...register("date")} />
          </Field>
        </div>

        <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
          <input type="checkbox" className="size-4 shrink-0 accent-primary" {...register("recurring")} />
          This is a recurring expense
        </label>

        {recurring ? (
          <Field label="Frequency" required htmlFor="frequency" error={errors.frequency?.message} hint="Used to project this month's recurring costs">
            <Select id="frequency" {...register("frequency")}>
              <option value="">Select frequency</option>
              {EXPENSE_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {submitError ? (
          <p className="flex items-start gap-2 text-sm text-danger">
            <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {submitError}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
            {needsApproval ? "Send for approval" : "Add expense"}
          </Button>
        </div>
      </form>
    </>
  );
}
