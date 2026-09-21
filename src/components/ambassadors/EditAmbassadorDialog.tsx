"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LuCircleAlert, LuLoaderCircle, LuPencil } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/forms/Field";
import { UniversityCombobox, type UniversityOption } from "@/components/forms/UniversityCombobox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ACADEMIC_LEVELS } from "@/lib/constants";
import { updateAmbassadorSchema, type UpdateAmbassadorInput } from "@/lib/validations/ambassadors";

export interface EditableAmbassador {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  universityId: string;
  department: string | null;
  level: string | null;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  hasLogin: boolean;
}

/** Admin correcting an ambassador's profile — name, contact, campus, payout details. */
export function EditAmbassadorDialog({
  ambassador,
  universities,
}: {
  ambassador: EditableAmbassador;
  universities: UniversityOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <LuPencil className="size-4" aria-hidden />
        Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          {open ? (
            <EditForm
              ambassador={ambassador}
              universities={universities}
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

function EditForm({
  ambassador,
  universities,
  onDone,
  onCancel,
}: {
  ambassador: EditableAmbassador;
  universities: UniversityOption[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<UpdateAmbassadorInput>({
    resolver: zodResolver(updateAmbassadorSchema),
    defaultValues: {
      fullName: ambassador.fullName,
      phone: ambassador.phone ?? "",
      email: ambassador.email ?? "",
      universityId: ambassador.universityId,
      department: ambassador.department ?? "",
      level: ambassador.level ?? "",
      bankName: ambassador.bankName ?? "",
      accountNumber: ambassador.accountNumber ?? "",
      accountName: ambassador.accountName ?? "",
    },
  });

  const onSubmit = async (data: UpdateAmbassadorInput) => {
    setSubmitError(null);
    // Only what the admin touched, so an untouched legacy value is never rewritten.
    const changed = Object.fromEntries(
      Object.entries(data).filter(([key]) => dirtyFields[key as keyof UpdateAmbassadorInput])
    );
    if (Object.keys(changed).length === 0) {
      onCancel();
      return;
    }
    try {
      const res = await fetch(`/api/admin/ambassadors/${ambassador.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changed),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not save the changes.");
      }
      onDone();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not save the changes.");
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit {ambassador.fullName}</DialogTitle>
        <DialogDescription>
          Changes apply immediately.
          {ambassador.hasLogin ? " Changing the email also changes the email they sign in with." : ""}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="ea-name" error={errors.fullName?.message} className="sm:col-span-2">
            <Input id="ea-name" {...register("fullName")} />
          </Field>
          <Field label="Phone" htmlFor="ea-phone" error={errors.phone?.message}>
            <Input id="ea-phone" inputMode="tel" {...register("phone")} />
          </Field>
          <Field label="Email" htmlFor="ea-email" error={errors.email?.message}>
            <Input id="ea-email" type="email" inputMode="email" {...register("email")} />
          </Field>
          <Field label="University" htmlFor="ea-uni" error={errors.universityId?.message} className="sm:col-span-2">
            <Controller
              control={control}
              name="universityId"
              render={({ field }) => (
                <UniversityCombobox
                  id="ea-uni"
                  universities={universities}
                  value={field.value ?? ""}
                  onChange={(v) => field.onChange(v)}
                  onBlur={field.onBlur}
                  allowOther={false}
                  invalid={!!errors.universityId}
                />
              )}
            />
          </Field>
          <Field label="Department" htmlFor="ea-dept" error={errors.department?.message}>
            <Input id="ea-dept" {...register("department")} />
          </Field>
          <Field label="Level" htmlFor="ea-level" error={errors.level?.message}>
            <Select id="ea-level" {...register("level")}>
              <option value="">Not specified</option>
              {/* Keep a legacy value that isn't in today's list selectable. */}
              {ambassador.level && !(ACADEMIC_LEVELS as readonly string[]).includes(ambassador.level) ? (
                <option value={ambassador.level}>{ambassador.level}</option>
              ) : null}
              {ACADEMIC_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Bank name" htmlFor="ea-bank" error={errors.bankName?.message}>
            <Input id="ea-bank" {...register("bankName")} />
          </Field>
          <Field label="Account number" htmlFor="ea-acctno" error={errors.accountNumber?.message}>
            <Input id="ea-acctno" inputMode="numeric" {...register("accountNumber")} />
          </Field>
          <Field label="Account name" htmlFor="ea-acctname" error={errors.accountName?.message} className="sm:col-span-2">
            <Input id="ea-acctname" {...register("accountName")} />
          </Field>
        </div>

        {submitError ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-danger">
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
            Save changes
          </Button>
        </div>
      </form>
    </>
  );
}
