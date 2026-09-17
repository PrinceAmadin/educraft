"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LuLoaderCircle, LuPencil } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/Field";
import { TagInput } from "@/components/forms/TagInput";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { COMMON_SKILLS, COMMON_SPECIALTIES } from "@/lib/constants";
import { updateWorkerSchema, type UpdateWorkerInput } from "@/lib/validations/workers";

export interface EditableWorker {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  educationLevel: string | null;
  specialties: string[];
  skills: string[];
  maxConcurrentProjects: number;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  notes: string | null;
}

/** Admin correcting any field on an already-created worker's record. */
export function EditWorkerDialog({ worker }: { worker: EditableWorker }) {
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
              worker={worker}
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
  worker,
  onDone,
  onCancel,
}: {
  worker: EditableWorker;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UpdateWorkerInput>({
    resolver: zodResolver(updateWorkerSchema),
    defaultValues: {
      fullName: worker.fullName,
      phone: worker.phone,
      email: worker.email ?? "",
      educationLevel: worker.educationLevel ?? "",
      specialties: worker.specialties,
      skills: worker.skills,
      maxConcurrentProjects: worker.maxConcurrentProjects,
      bankName: worker.bankName ?? "",
      accountNumber: worker.accountNumber ?? "",
      accountName: worker.accountName ?? "",
      notes: worker.notes ?? "",
    },
  });

  const onSubmit = async (data: UpdateWorkerInput) => {
    setSubmitError(null);
    try {
      const res = await fetch(`/api/admin/workers/${worker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not save the correction.");
      }
      onDone();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not save the correction.");
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit {worker.fullName}</DialogTitle>
        <DialogDescription>Correct any field — changes apply immediately.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="ew-name" error={errors.fullName?.message}>
            <Input id="ew-name" {...register("fullName")} />
          </Field>
          <Field label="Phone" htmlFor="ew-phone" error={errors.phone?.message}>
            <Input id="ew-phone" {...register("phone")} />
          </Field>
          <Field label="Email" htmlFor="ew-email" error={errors.email?.message}>
            <Input id="ew-email" type="email" {...register("email")} />
          </Field>
          <Field label="Education" htmlFor="ew-edu" error={errors.educationLevel?.message}>
            <Input id="ew-edu" {...register("educationLevel")} />
          </Field>
          <Field
            label="Max concurrent projects"
            htmlFor="ew-max"
            error={errors.maxConcurrentProjects?.message as string | undefined}
          >
            <Input id="ew-max" type="number" min={1} max={20} {...register("maxConcurrentProjects")} />
          </Field>
        </div>

        <Field label="Specialties" htmlFor="ew-specialties" error={errors.specialties?.message as string | undefined}>
          <Controller
            control={control}
            name="specialties"
            render={({ field }) => (
              <TagInput id="ew-specialties" value={field.value ?? []} onChange={field.onChange} suggestions={[...COMMON_SPECIALTIES]} />
            )}
          />
        </Field>
        <Field label="Skills" htmlFor="ew-skills" error={errors.skills?.message as string | undefined}>
          <Controller
            control={control}
            name="skills"
            render={({ field }) => (
              <TagInput id="ew-skills" value={field.value ?? []} onChange={field.onChange} suggestions={[...COMMON_SKILLS]} />
            )}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Bank name" htmlFor="ew-bank" error={errors.bankName?.message}>
            <Input id="ew-bank" {...register("bankName")} />
          </Field>
          <Field label="Account number" htmlFor="ew-acctno" error={errors.accountNumber?.message}>
            <Input id="ew-acctno" {...register("accountNumber")} />
          </Field>
          <Field label="Account name" htmlFor="ew-acctname" error={errors.accountName?.message} className="sm:col-span-2">
            <Input id="ew-acctname" {...register("accountName")} />
          </Field>
        </div>

        <Field label="Internal notes" htmlFor="ew-notes" error={errors.notes?.message}>
          <Textarea id="ew-notes" rows={3} {...register("notes")} />
        </Field>

        {submitError ? <p className="text-sm text-danger">{submitError}</p> : null}

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
