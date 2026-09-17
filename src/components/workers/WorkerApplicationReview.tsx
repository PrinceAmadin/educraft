"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LuCheck, LuCircleAlert, LuLoaderCircle, LuPencil, LuX } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { formatDate } from "@/lib/utils";
import {
  editWorkerApplicationSchema,
  type EditWorkerApplicationInput,
} from "@/lib/validations/worker-application";
import type { WorkerApplicationRow } from "@/lib/services/worker-applications";

export function WorkerApplicationReview({ rows }: { rows: WorkerApplicationRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<WorkerApplicationRow | null>(null);
  const [rejecting, setRejecting] = React.useState<WorkerApplicationRow | null>(null);
  const [note, setNote] = React.useState("");

  async function run(id: string, action: "approve" | "reject", body: unknown = {}) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/workers/applications/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "That action could not be completed.");
      }
      setRejecting(null);
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That action could not be completed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{row.fullName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {row.phone} · {row.email} · applied {formatDate(row.createdAt)}
                </p>
                {row.educationLevel ? (
                  <p className="mt-1 text-xs text-muted-foreground">{row.educationLevel}</p>
                ) : null}
                {row.specialties.length > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Specialties: {row.specialties.join(", ")}
                  </p>
                ) : null}
                {row.skills.length > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">Skills: {row.skills.join(", ")}</p>
                ) : null}
                {row.bankName ? (
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {row.bankName} · {row.accountNumber} · {row.accountName}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setEditing(row)}>
                  <LuPencil className="size-4" aria-hidden />
                  Edit
                </Button>
                <Button size="sm" disabled={busy !== null} onClick={() => run(row.id, "approve")}>
                  {busy === row.id ? (
                    <LuLoaderCircle className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <LuCheck className="size-4" aria-hidden />
                  )}
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-danger/40 text-danger hover:bg-danger/10"
                  disabled={busy !== null}
                  onClick={() => {
                    setRejecting(row);
                    setNote("");
                    setError(null);
                  }}
                >
                  <LuX className="size-4" aria-hidden />
                  Reject
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Reject dialog */}
      <Dialog open={rejecting !== null} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          {rejecting ? (
            <>
              <DialogHeader>
                <DialogTitle>Reject {rejecting.fullName}</DialogTitle>
                <DialogDescription>Optionally leave a note for the record.</DialogDescription>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(rejecting.id, "reject", { note: note.trim() });
                }}
              >
                <textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Reason (optional)"
                  className="w-full rounded-lg border border-input-border bg-input p-2 text-sm text-foreground focus-visible:border-ring focus-visible:bg-card focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20"
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setRejecting(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" variant="destructive" disabled={busy !== null}>
                    {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                    Reject
                  </Button>
                </div>
              </form>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xl">
          {editing ? (
            <EditApplicationForm
              row={editing}
              onDone={() => {
                setEditing(null);
                router.refresh();
              }}
              onCancel={() => setEditing(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {rows.some((r) => r.workerId) ? (
        <p className="text-xs text-muted-foreground">
          Approved rows link through to the new{" "}
          <Link href="/admin/workers" className="text-primary hover:underline">
            worker record
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}

function EditApplicationForm({
  row,
  onDone,
  onCancel,
}: {
  row: WorkerApplicationRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<EditWorkerApplicationInput>({
    resolver: zodResolver(editWorkerApplicationSchema),
    defaultValues: {
      fullName: row.fullName,
      phone: row.phone,
      email: row.email,
      educationLevel: row.educationLevel ?? "",
      specialties: row.specialties,
      skills: row.skills,
      bankName: row.bankName ?? "",
      accountNumber: row.accountNumber ?? "",
      accountName: row.accountName ?? "",
    },
  });

  const onSubmit = async (data: EditWorkerApplicationInput) => {
    setSubmitError(null);
    try {
      const res = await fetch(`/api/admin/workers/applications/${row.id}`, {
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
        <DialogTitle>Correct {row.fullName}&apos;s details</DialogTitle>
        <DialogDescription>Fix anything before approving or rejecting.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="e-name" error={errors.fullName?.message}>
            <Input id="e-name" {...register("fullName")} />
          </Field>
          <Field label="Phone" htmlFor="e-phone" error={errors.phone?.message}>
            <Input id="e-phone" {...register("phone")} />
          </Field>
          <Field label="Email" htmlFor="e-email" error={errors.email?.message} className="sm:col-span-2">
            <Input id="e-email" type="email" {...register("email")} />
          </Field>
          <Field label="Education" htmlFor="e-edu" error={errors.educationLevel?.message}>
            <Input id="e-edu" {...register("educationLevel")} />
          </Field>
        </div>

        <Field
          label="Specialties"
          htmlFor="e-specialties"
          error={errors.specialties?.message as string | undefined}
        >
          <Controller
            control={control}
            name="specialties"
            render={({ field }) => (
              <TagInput
                id="e-specialties"
                value={field.value ?? []}
                onChange={field.onChange}
                suggestions={[...COMMON_SPECIALTIES]}
              />
            )}
          />
        </Field>
        <Field label="Skills" htmlFor="e-skills" error={errors.skills?.message as string | undefined}>
          <Controller
            control={control}
            name="skills"
            render={({ field }) => (
              <TagInput id="e-skills" value={field.value ?? []} onChange={field.onChange} suggestions={[...COMMON_SKILLS]} />
            )}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Bank name" htmlFor="e-bank" error={errors.bankName?.message}>
            <Input id="e-bank" {...register("bankName")} />
          </Field>
          <Field label="Account number" htmlFor="e-acctno" error={errors.accountNumber?.message}>
            <Input id="e-acctno" {...register("accountNumber")} />
          </Field>
          <Field label="Account name" htmlFor="e-acctname" error={errors.accountName?.message} className="sm:col-span-2">
            <Input id="e-acctname" {...register("accountName")} />
          </Field>
        </div>

        {submitError ? <p className="text-sm text-danger">{submitError}</p> : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
            Save correction
          </Button>
        </div>
      </form>
    </>
  );
}
