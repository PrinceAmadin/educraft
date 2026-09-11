"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/forms/Field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  createExpenseSchema,
  EXPENSE_CATEGORIES,
  EXPENSE_FREQUENCIES,
  type CreateExpenseInput,
} from "@/lib/validations/expenses";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AddExpenseDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        Add expense
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          {open ? (
            <ExpenseForm
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

function ExpenseForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateExpenseInput>({
    resolver: zodResolver(createExpenseSchema),
    defaultValues: {
      category: "Software",
      description: "",
      amount: undefined,
      date: today(),
      recurring: false,
      frequency: "",
    },
  });

  const recurring = watch("recurring");

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
        <DialogDescription>Logged against the business, not any single project.</DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Field label="Category" required htmlFor="category" error={errors.category?.message}>
          <Select id="category" {...register("category")}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Description" required htmlFor="description" error={errors.description?.message}>
          <Input id="description" autoComplete="off" {...register("description")} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount (₦)" required htmlFor="amount" error={errors.amount?.message}>
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
          <Field
            label="Frequency"
            required
            htmlFor="frequency"
            error={errors.frequency?.message}
            hint="Used to project this month's recurring costs"
          >
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
            Add expense
          </Button>
        </div>
      </form>
    </>
  );
}
