"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LuCheck, LuCircleAlert, LuLoaderCircle, LuListChecks, LuPencil, LuPenLine, LuX } from "react-icons/lu";
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
import type { ScreeningStatusLite } from "@/lib/services/screening";
import type { FinalStatusLite } from "@/lib/services/final-practical";

const SCREEN_CHIP: Record<string, { label: string; tone: string }> = {
  SENT: { label: "Screening sent", tone: "bg-zone text-muted-foreground" },
  IN_PROGRESS: { label: "Screening started", tone: "bg-gold/15 text-gold" },
  PASS: { label: "Screening passed", tone: "bg-success/15 text-success" },
  FAIL: { label: "Screening failed", tone: "bg-danger/15 text-danger" },
  BORDERLINE: { label: "Borderline — review", tone: "bg-gold/15 text-gold" },
};

const FINAL_CHIP: Record<string, { label: string; tone: string }> = {
  SENT: { label: "Final sent", tone: "bg-zone text-muted-foreground" },
  IN_PROGRESS: { label: "Final started", tone: "bg-gold/15 text-gold" },
  REVIEW: { label: "Final — review", tone: "bg-gold/15 text-gold" },
  PASS: { label: "Final passed", tone: "bg-success/15 text-success" },
  FAIL: { label: "Final failed", tone: "bg-danger/15 text-danger" },
};

export function WorkerApplicationReview({
  rows,
  screening,
  final,
}: {
  rows: WorkerApplicationRow[];
  screening: Record<string, ScreeningStatusLite>;
  final: Record<string, FinalStatusLite>;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<WorkerApplicationRow | null>(null);
  const [rejecting, setRejecting] = React.useState<WorkerApplicationRow | null>(null);
  const [note, setNote] = React.useState("");

  async function sendScreening(id: string) {
    setBusy(`screen-${id}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/workers/applications/${id}/screening`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not send the screening test.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the screening test.");
    } finally {
      setBusy(null);
    }
  }

  function screenState(s: ScreeningStatusLite | undefined): { key: string; chip: { label: string; tone: string } } | null {
    if (!s) return null;
    const key = s.status === "SUBMITTED" ? s.reviewDecision ?? s.outcome ?? "BORDERLINE" : s.status;
    return { key, chip: SCREEN_CHIP[key] ?? SCREEN_CHIP.SENT };
  }

  function finalState(f: FinalStatusLite | undefined): { key: string; chip: { label: string; tone: string } } | null {
    if (!f) return null;
    const key = f.status === "SUBMITTED" ? f.reviewDecision ?? "REVIEW" : f.status;
    return { key, chip: FINAL_CHIP[key] ?? FINAL_CHIP.SENT };
  }

  async function sendFinal(id: string) {
    setBusy(`final-${id}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/workers/applications/${id}/final`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not send the final assessment.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the final assessment.");
    } finally {
      setBusy(null);
    }
  }

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

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {(() => {
                  const s = screenState(screening[row.id]);
                  if (s) {
                    return (
                      <span className="inline-flex items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${s.chip.tone}`}>
                          {s.chip.label}
                          {screening[row.id]?.overallPercent != null ? ` · ${screening[row.id]!.overallPercent}%` : ""}
                        </span>
                        {screening[row.id]?.status === "SUBMITTED" ? (
                          <Link
                            href={`/admin/workers/screening?a=${screening[row.id]!.assignmentId}`}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            Review →
                          </Link>
                        ) : null}
                      </span>
                    );
                  }
                  return (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => sendScreening(row.id)}
                    >
                      {busy === `screen-${row.id}` ? (
                        <LuLoaderCircle className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <LuListChecks className="size-4" aria-hidden />
                      )}
                      Send screening test
                    </Button>
                  );
                })()}
                {(() => {
                  // The final practical opens once screening is passed.
                  if (screenState(screening[row.id])?.key !== "PASS") return null;
                  const f = finalState(final[row.id]);
                  if (f) {
                    return (
                      <span className="inline-flex items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${f.chip.tone}`}>{f.chip.label}</span>
                        {final[row.id]?.status === "SUBMITTED" ? (
                          <Link href={`/admin/workers/final?a=${final[row.id]!.assessmentId}`} className="text-xs font-medium text-primary hover:underline">
                            Review →
                          </Link>
                        ) : null}
                      </span>
                    );
                  }
                  return (
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => sendFinal(row.id)}>
                      {busy === `final-${row.id}` ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuPenLine className="size-4" aria-hidden />}
                      Send final practical
                    </Button>
                  );
                })()}
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
        <DialogDescription>
          Fix anything before approving or rejecting. Their password stays as they set it
          {row.emailLocked ? "." : "; a corrected email becomes the email they sign in with."}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="e-name" error={errors.fullName?.message}>
            <Input id="e-name" {...register("fullName")} />
          </Field>
          <Field label="Phone" htmlFor="e-phone" error={errors.phone?.message}>
            <Input id="e-phone" {...register("phone")} />
          </Field>
          <Field
            label="Email"
            htmlFor="e-email"
            error={errors.email?.message}
            hint={row.emailLocked ? "This is the login they already use, so it can't be changed here." : undefined}
            className="sm:col-span-2"
          >
            <Input id="e-email" type="email" inputMode="email" readOnly={row.emailLocked} {...register("email")} />
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
