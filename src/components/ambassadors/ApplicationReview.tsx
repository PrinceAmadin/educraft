"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LuCheck, LuCircleAlert, LuLoaderCircle, LuPencil, LuX } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/Field";
import { OTHER_UNIVERSITY, UniversityCombobox, type UniversityOption } from "@/components/forms/UniversityCombobox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ACADEMIC_LEVELS, REACH_ROLES } from "@/lib/constants";
import { flagLabel, reachSizeLabel } from "@/lib/ambassador-score";
import { formatDate } from "@/lib/utils";
import { editApplicationSchema, type EditApplicationInput } from "@/lib/validations/application";
import type { ApplicationRow } from "@/lib/services/applications";

export function ApplicationReview({
  rows,
  universities,
}: {
  rows: ApplicationRow[];
  universities: UniversityOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [modal, setModal] = React.useState<
    { row: ApplicationRow; action: "approve" | "reject" | "edit" } | null
  >(null);
  const [universityId, setUniversityId] = React.useState("");
  const [note, setNote] = React.useState("");

  async function run(id: string, action: "approve" | "reject", body: unknown) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ambassadors/applications/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "That action could not be completed.");
      }
      setModal(null);
      setNote("");
      setUniversityId("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That action could not be completed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && !modal ? (
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
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                  {row.fullName}
                  {row.slotCode ? (
                    <span className="rounded-md bg-zone px-1.5 py-0.5 font-mono text-xs font-medium text-primary">
                      EduCraftA-{row.slotCode}
                    </span>
                  ) : null}
                  <ScoreChip row={row} />
                  {row.score?.flags.map((flag) => (
                    <span
                      key={flag}
                      className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger"
                    >
                      {flagLabel(flag, row)}
                    </span>
                  ))}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {row.phone}
                  {row.email ? ` · ${row.email}` : ""} · applied {formatDate(row.createdAt)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.university ?? "University not given"}
                  {row.department ? ` · ${row.department}` : ""}
                  {row.level ? ` · ${row.level}` : ""}
                </p>
                {row.bankName ? (
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {row.bankName} · {row.accountNumber} · {row.accountName}
                  </p>
                ) : null}
                <ReachLine row={row} />
                {row.pitchMessage ? (
                  <p className="mt-2 rounded-lg bg-elevated p-2 text-sm text-foreground">
                    &ldquo;{row.pitchMessage}&rdquo;
                  </p>
                ) : row.motivation ? (
                  <p className="mt-2 rounded-lg bg-elevated p-2 text-sm text-foreground">
                    &ldquo;{row.motivation}&rdquo;
                  </p>
                ) : null}
                <AnswersDisclosure row={row} />
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => {
                    setModal({ row, action: "edit" });
                    setError(null);
                  }}
                >
                  <LuPencil className="size-4" aria-hidden />
                  Edit
                </Button>
                <Button
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => {
                    setModal({ row, action: "approve" });
                    setUniversityId("");
                    setError(null);
                  }}
                >
                  <LuCheck className="size-4" aria-hidden />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-danger/40 text-danger hover:bg-danger/10"
                  disabled={busy !== null}
                  onClick={() => {
                    setModal({ row, action: "reject" });
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

      <Dialog open={modal !== null} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent className={modal?.action === "edit" ? "max-w-xl" : undefined}>
          {modal?.action === "edit" ? (
            <EditApplicationForm
              row={modal.row}
              universities={universities}
              onDone={() => {
                setModal(null);
                router.refresh();
              }}
              onCancel={() => setModal(null)}
            />
          ) : modal?.action === "approve" ? (
            <>
              <DialogHeader>
                <DialogTitle>Approve {modal.row.fullName}</DialogTitle>
                <DialogDescription>
                  Creates an ambassador with a fresh referral code
                  {modal.row.slotCode ? ` in slot EduCraftA-${modal.row.slotCode}` : ""}.
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(modal.row.id, "approve", universityId ? { universityId } : {});
                }}
              >
                {modal.row.needsUniversity ? (
                  <label className="block">
                    <span className="mb-1 block text-[13px] font-medium text-foreground">
                      University (the applicant chose &ldquo;Other&rdquo;)
                    </span>
                    <Select
                      value={universityId}
                      onChange={(e) => setUniversityId(e.target.value)}
                      required
                    >
                      <option value="">Select a university</option>
                      {universities.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.abbreviation})
                        </option>
                      ))}
                    </Select>
                  </label>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    University: {modal.row.university}
                  </p>
                )}
                {error ? <p className="text-xs text-danger">{error}</p> : null}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setModal(null)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={busy !== null || (modal.row.needsUniversity && !universityId)}
                  >
                    {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                    Approve
                  </Button>
                </div>
              </form>
            </>
          ) : modal ? (
            <>
              <DialogHeader>
                <DialogTitle>Reject {modal.row.fullName}</DialogTitle>
                <DialogDescription>Optionally leave a note for the record.</DialogDescription>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(modal.row.id, "reject", { note: note.trim() });
                }}
              >
                <textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Reason (optional)"
                  className="w-full rounded-lg border border-input-border bg-input p-2 text-sm text-foreground focus-visible:border-ring focus-visible:bg-card focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20"
                />
                {error ? <p className="text-xs text-danger">{error}</p> : null}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setModal(null)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    variant="destructive"
                    disabled={busy !== null}
                  >
                    {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                    Reject
                  </Button>
                </div>
              </form>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Admin correcting a pending application — every detail they typed, plus the slot. Never the password. */
function EditApplicationForm({
  row,
  universities,
  onDone,
  onCancel,
}: {
  row: ApplicationRow;
  universities: UniversityOption[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [uniChoice, setUniChoice] = React.useState(
    row.universityId ?? (row.otherUniversity ? OTHER_UNIVERSITY : "")
  );
  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<EditApplicationInput>({
    resolver: zodResolver(editApplicationSchema),
    defaultValues: {
      slotCode: row.slotCode ?? "",
      fullName: row.fullName,
      phone: row.phone,
      email: row.email ?? "",
      universityId: row.universityId ?? "",
      otherUniversity: row.otherUniversity ?? "",
      department: row.department ?? "",
      level: row.level ?? "",
      bankName: row.bankName ?? "",
      accountNumber: row.accountNumber ?? "",
      accountName: row.accountName ?? "",
    },
  });

  const onSubmit = async (data: EditApplicationInput) => {
    setSubmitError(null);
    // Only what the admin touched. The university is one choice across two fields.
    const changed: Partial<EditApplicationInput> = Object.fromEntries(
      Object.entries(data).filter(([key]) => dirtyFields[key as keyof EditApplicationInput])
    );
    if (dirtyFields.universityId || dirtyFields.otherUniversity) {
      changed.universityId = data.universityId ?? "";
      changed.otherUniversity = data.otherUniversity ?? "";
    }
    if (Object.keys(changed).length === 0) {
      onCancel();
      return;
    }
    try {
      const res = await fetch(`/api/admin/ambassadors/applications/${row.id}`, {
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
        <DialogTitle>Edit {row.fullName}&apos;s application</DialogTitle>
        <DialogDescription>
          Fix anything before approving or rejecting. Their password stays as they set it
          {row.emailLocked ? "." : "; a corrected email becomes the email they sign in with."}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <Field
          label="Slot ID"
          htmlFor="ap-slot"
          error={errors.slotCode?.message}
          hint="Any free general slot number. Their client link becomes /EduCraftA/ plus this number."
        >
          <div className="flex items-center gap-2">
            <span className="shrink-0 font-mono text-sm text-muted-foreground">EduCraftA-</span>
            <Input id="ap-slot" inputMode="numeric" className="font-mono" {...register("slotCode")} />
          </div>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="ap-name" error={errors.fullName?.message} className="sm:col-span-2">
            <Input id="ap-name" {...register("fullName")} />
          </Field>
          <Field label="Phone" htmlFor="ap-phone" error={errors.phone?.message}>
            <Input id="ap-phone" inputMode="tel" {...register("phone")} />
          </Field>
          <Field
            label="Email"
            htmlFor="ap-email"
            error={errors.email?.message}
            hint={row.emailLocked ? "This is the login they already use, so it can't be changed here." : undefined}
          >
            <Input id="ap-email" type="email" inputMode="email" readOnly={row.emailLocked} {...register("email")} />
          </Field>
          <Field label="University" htmlFor="ap-uni" error={errors.universityId?.message} className="sm:col-span-2">
            <UniversityCombobox
              id="ap-uni"
              universities={universities}
              value={uniChoice}
              onChange={(v, typed) => {
                setUniChoice(v);
                if (v === OTHER_UNIVERSITY) {
                  setValue("universityId", "", { shouldDirty: true });
                  if (typed) setValue("otherUniversity", typed, { shouldDirty: true });
                } else {
                  setValue("universityId", v, { shouldDirty: true });
                  setValue("otherUniversity", "", { shouldDirty: true });
                }
              }}
            />
          </Field>
          {uniChoice === OTHER_UNIVERSITY ? (
            <Field
              label="Which university?"
              htmlFor="ap-otheruni"
              error={errors.otherUniversity?.message}
              className="sm:col-span-2"
            >
              <Input id="ap-otheruni" {...register("otherUniversity")} />
            </Field>
          ) : null}
          <Field label="Department" htmlFor="ap-dept" error={errors.department?.message}>
            <Input id="ap-dept" {...register("department")} />
          </Field>
          <Field label="Level" htmlFor="ap-level" error={errors.level?.message}>
            <Select id="ap-level" {...register("level")}>
              <option value="">Not specified</option>
              {row.level && !(ACADEMIC_LEVELS as readonly string[]).includes(row.level) ? (
                <option value={row.level}>{row.level}</option>
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
          <Field label="Bank name" htmlFor="ap-bank" error={errors.bankName?.message}>
            <Input id="ap-bank" {...register("bankName")} />
          </Field>
          <Field label="Account number" htmlFor="ap-acctno" error={errors.accountNumber?.message}>
            <Input id="ap-acctno" inputMode="numeric" className="font-mono" {...register("accountNumber")} />
          </Field>
          <Field label="Account name" htmlFor="ap-acctname" error={errors.accountName?.message} className="sm:col-span-2">
            <Input id="ap-acctname" {...register("accountName")} />
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

const SCORE_CHIP: Record<"strong" | "middle" | "weak", string> = {
  strong: "bg-primary/10 text-primary",
  middle: "bg-gold/15 text-gold",
  weak: "bg-zone text-muted-foreground",
};

/**
 * Triage only. The score says "read this one first", never "approve this one" —
 * the answers below it are what the decision is actually made on.
 */
function ScoreChip({ row }: { row: ApplicationRow }) {
  if (!row.score) return null;
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-mono text-xs font-medium ${SCORE_CHIP[row.score.band]}`}
      title="Reach, roles and commitment — a sort order, not a verdict"
    >
      {row.score.total}/{row.score.max}
    </span>
  );
}

function ReachLine({ row }: { row: ApplicationRow }) {
  const size = reachSizeLabel(row.reachSize);
  const roles = row.reachRoles
    .filter((r) => r !== "NONE")
    .map((r) => REACH_ROLES.find((o) => o.value === r)?.label ?? r);
  if (!size && roles.length === 0 && !row.reachGroups) return null;
  const parts = [size ? `${size} reachable` : null, roles.length ? roles.join(", ") : null, row.reachGroups].filter(
    Boolean
  );
  return <p className="mt-1 text-xs text-muted-foreground">{parts.join(" · ")}</p>;
}

/** Collapsed: only worth opening for the ones being seriously considered. */
function AnswersDisclosure({ row }: { row: ApplicationRow }) {
  const answers = [
    {
      label: "Expects in 30 days",
      value: row.expectedReferrals == null ? null : `${row.expectedReferrals} students`,
    },
    { label: "Week one", value: row.firstWeekPlan },
    // Retired Sept 2026. Still shown for an application that answered them.
    { label: "If they say it's a scam", value: row.objectionReply },
    { label: "If a referred student is upset", value: row.clientUpsetReply },
  ].filter((a) => a.value);
  if (answers.length === 0) return null;
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-xs font-medium text-primary">Show answers</summary>
      <dl className="mt-2 space-y-2">
        {answers.map((a) => (
          <div key={a.label}>
            <dt className="meta-label">{a.label}</dt>
            <dd className="text-sm text-foreground">{a.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
