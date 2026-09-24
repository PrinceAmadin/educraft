"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, CircleAlert, Copy, KeyRound, Loader2, Pencil, Plus, UserMinus, UserX, UserCheck } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/forms/Field";
import { RoleChip } from "@/components/layout/RoleChip";
import { EXEC_ROLE_LABELS, INVITABLE_ROLES, ROLE_TITLES, isExecRole } from "@/lib/rbac";
import { inviteExecutiveSchema, type InviteExecutiveInput } from "@/lib/validations/team";
import type { ExecutiveRow } from "@/lib/services/team";
import { cn, formatDate, initials } from "@/lib/utils";
import { z } from "zod";

interface Credentials {
  fullName: string;
  email: string;
  temporaryPassword: string;
  /** "invited" or "reset" — only the wording differs. */
  kind: "invited" | "reset";
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(body?.error ?? "That could not be saved.");
  return body as T;
}

function roleLabel(role: string) {
  return isExecRole(role) ? EXEC_ROLE_LABELS[role] : role === "OPS_MANAGER" ? "Operations Manager (retired)" : role;
}

export function TeamRoles({ executives, currentUserId }: { executives: ExecutiveRow[]; currentUserId: string }) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ExecutiveRow | null>(null);
  const [credentials, setCredentials] = React.useState<Credentials | null>(null);

  const pending = executives.filter((e) => e.isActive && !e.hasSignedIn && e.role !== "SUPER_ADMIN");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="meta-label">Executive members</p>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <Plus className="size-4" aria-hidden />
          Invite executive
        </Button>
      </div>

      {credentials ? <CredentialsPanel credentials={credentials} onDone={() => setCredentials(null)} /> : null}

      {/* Mobile cards */}
      <ul className="space-y-3 md:hidden">
        {executives.map((e) => (
          <li key={e.id} className="surface p-4">
            <div className="flex items-start gap-3">
              <Avatar>
                <AvatarFallback>{initials(e.fullName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                  <span className="truncate">{e.fullName}</span>
                  <RoleChip role={e.role} />
                  {e.id === currentUserId ? <span className="text-xs font-normal text-muted-foreground">(you)</span> : null}
                </p>
                <p className="text-[13px] text-muted-foreground">{e.title}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{e.email}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <StatusBadge row={e} />
              <Button size="sm" variant="outline" onClick={() => setEditing(e)}>
                <Pencil className="size-4" aria-hidden />
                Edit
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop table: faint row dividers, no outer container */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[13px] text-muted-foreground">
              <th className="px-3 py-2.5 font-medium">Executive</th>
              <th className="px-3 py-2.5 font-medium">Title</th>
              <th className="px-3 py-2.5 font-medium">Role</th>
              <th className="px-3 py-2.5 font-medium">Email</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {executives.map((e) => (
              <tr key={e.id} className="border-t border-border/70">
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>{initials(e.fullName)}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-foreground">
                      {e.fullName}
                      {e.id === currentUserId ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span> : null}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3 text-muted-foreground">{e.title}</td>
                <td className="px-3 py-3">
                  <span className="inline-flex items-center gap-2">
                    <RoleChip role={e.role} />
                    <span className="text-xs text-muted-foreground">{roleLabel(e.role)}</span>
                  </span>
                </td>
                <td className="px-3 py-3 text-muted-foreground">{e.email}</td>
                <td className="px-3 py-3">
                  <StatusBadge row={e} />
                </td>
                <td className="px-3 py-3 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(e)}>
                    <Pencil className="size-4" aria-hidden />
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pending.length > 0 ? (
        <section className="rounded-2xl bg-zone p-4 sm:p-5">
          <p className="meta-label">Invited (pending)</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Logins created but never signed in to. If they never got their password, open Edit and reset it.
          </p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {pending.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-foreground">
                  {e.fullName} <span className="text-muted-foreground">· {e.email}</span>
                </span>
                <span className="font-mono text-xs text-muted-foreground">invited {formatDate(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          {inviteOpen ? (
            <InviteExecutiveForm
              onCancel={() => setInviteOpen(false)}
              onDone={(c) => {
                setInviteOpen(false);
                setCredentials({ ...c, kind: "invited" });
                router.refresh();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(open) => (open ? null : setEditing(null))}>
        <DialogContent>
          {editing ? (
            <EditExecutiveForm
              row={editing}
              isSelf={editing.id === currentUserId}
              onCancel={() => setEditing(null)}
              onDone={() => {
                setEditing(null);
                router.refresh();
              }}
              onCredentials={(c) => {
                setEditing(null);
                setCredentials({ ...c, kind: "reset" });
                router.refresh();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ row }: { row: ExecutiveRow }) {
  if (!row.isActive) return <Badge variant="neutral">Switched off</Badge>;
  if (!row.hasSignedIn && row.role !== "SUPER_ADMIN") return <Badge variant="warning">Pending sign-in</Badge>;
  return <Badge variant="success">Active</Badge>;
}

/** The one-time password, shown once. Copy puts the whole sign-in note on the clipboard. */
function CredentialsPanel({ credentials, onDone }: { credentials: Credentials; onDone: () => void }) {
  const [copied, setCopied] = React.useState(false);
  const note = `EduCraft HQ sign-in for ${credentials.fullName}\nSign in: ${typeof window !== "undefined" ? window.location.origin : ""}/login\nEmail: ${credentials.email}\nTemporary password: ${credentials.temporaryPassword}\n\nPlease change it after your first sign-in (Sign in → "Set it with an email code").`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(note);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="rounded-2xl bg-zone p-4 sm:p-5" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="rounded-full bg-card p-2 text-primary shadow-soft">
          <KeyRound className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {credentials.kind === "invited" ? `${credentials.fullName} can sign in now` : `New password for ${credentials.fullName}`}
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            This password is shown once. Send it to them yourself — nothing is emailed.
          </p>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-6">
            <dt className="meta-label">Email</dt>
            <dd className="font-mono text-foreground">{credentials.email}</dd>
            <dt className="meta-label">Temporary password</dt>
            <dd className="font-mono text-foreground">{credentials.temporaryPassword}</dd>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={copy}>
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied ? "Copied" : "Copy credentials"}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDone}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function InviteExecutiveForm({
  onDone,
  onCancel,
}: {
  onDone: (c: { fullName: string; email: string; temporaryPassword: string }) => void;
  onCancel: () => void;
}) {
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<InviteExecutiveInput>({
    resolver: zodResolver(inviteExecutiveSchema),
    defaultValues: { fullName: "", email: "", role: "CO_CEO_CFO", title: ROLE_TITLES.CO_CEO_CFO, phone: "" },
  });
  const role = watch("role");
  const title = watch("title");

  // The title follows the role until the founder types their own.
  const lastDefault = React.useRef<string>(ROLE_TITLES.CO_CEO_CFO);
  React.useEffect(() => {
    if (!title || title === lastDefault.current) {
      setValue("title", ROLE_TITLES[role]);
      lastDefault.current = ROLE_TITLES[role];
    }
  }, [role, title, setValue]);

  const onSubmit = async (data: InviteExecutiveInput) => {
    setSubmitError(null);
    try {
      const created = await call<{ email: string; fullName: string; temporaryPassword: string }>("/api/admin/team", {
        method: "POST",
        body: JSON.stringify(data),
      });
      onDone(created);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not invite them.");
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Invite an executive</DialogTitle>
        <DialogDescription>Creates their login. You will get a one-time password to send them.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Field label="Full name" required htmlFor="fullName" error={errors.fullName?.message}>
          <Input id="fullName" autoComplete="off" {...register("fullName")} />
        </Field>
        <Field label="Email" required htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" inputMode="email" autoComplete="off" {...register("email")} />
        </Field>
        <Field label="Role" required htmlFor="role" error={errors.role?.message} hint="A second Super Admin needs the database, not this form.">
          <Select id="role" {...register("role")}>
            {INVITABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {EXEC_ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Title" htmlFor="title" error={errors.title?.message}>
          <Input id="title" autoComplete="off" {...register("title")} />
        </Field>
        <Field label="Phone" htmlFor="phone" error={errors.phone?.message}>
          <Input id="phone" inputMode="tel" autoComplete="off" {...register("phone")} />
        </Field>

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
            Create login
          </Button>
        </div>
      </form>
    </>
  );
}

const editFormSchema = z.object({
  fullName: z.string().trim().min(2, "Enter their full name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(160),
  role: z.string(),
  title: z.string().trim().max(120),
  phone: z.string().trim().max(20),
});
type EditFormValues = z.infer<typeof editFormSchema>;

function EditExecutiveForm({
  row,
  isSelf,
  onDone,
  onCancel,
  onCredentials,
}: {
  row: ExecutiveRow;
  isSelf: boolean;
  onDone: () => void;
  onCancel: () => void;
  onCredentials: (c: { fullName: string; email: string; temporaryPassword: string }) => void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<"save" | "reset" | "active" | "remove" | null>(null);
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const [alsoDeactivate, setAlsoDeactivate] = React.useState(true);
  const isSuperAdmin = row.role === "SUPER_ADMIN";

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditFormValues>({
    resolver: zodResolver(editFormSchema),
    defaultValues: { fullName: row.fullName, email: row.email, role: row.role, title: row.title, phone: row.phone ?? "" },
  });

  const onSubmit = async (data: EditFormValues) => {
    setError(null);
    setBusy("save");
    try {
      const patch: Record<string, unknown> = {};
      if (data.fullName !== row.fullName) patch.fullName = data.fullName;
      if (data.email !== row.email) patch.email = data.email;
      if (!isSuperAdmin && data.role !== row.role) patch.role = data.role;
      if (data.title !== row.title) patch.title = data.title;
      if (data.phone !== (row.phone ?? "")) patch.phone = data.phone;
      if (Object.keys(patch).length === 0) {
        onDone();
        return;
      }
      await call(`/api/admin/team/${row.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  };

  async function resetPassword() {
    setError(null);
    setBusy("reset");
    try {
      const c = await call<{ email: string; fullName: string; temporaryPassword: string }>(`/api/admin/team/${row.id}/reset-password`, {
        method: "POST",
      });
      onCredentials(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset the password.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive() {
    setError(null);
    setBusy("active");
    try {
      await call(`/api/admin/team/${row.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !row.isActive }) });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the login.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setError(null);
    setBusy("remove");
    try {
      await call(`/api/admin/team/${row.id}?deactivate=${alsoDeactivate ? "1" : "0"}`, { method: "DELETE" });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove them.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit {row.fullName}</DialogTitle>
        <DialogDescription>{isSuperAdmin ? "The Super Admin role itself can't be changed here." : "Change what they are called, their role, or their sign-in email."}</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Field label="Full name" required htmlFor="edit-fullName" error={errors.fullName?.message}>
          <Input id="edit-fullName" autoComplete="off" {...register("fullName")} />
        </Field>
        <Field label="Role" required htmlFor="edit-role">
          {isSuperAdmin ? (
            <div className="flex h-12 items-center gap-2 px-1 text-sm text-foreground">
              <RoleChip role={row.role} /> Super Admin
            </div>
          ) : (
            <Select id="edit-role" {...register("role")}>
              {INVITABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {EXEC_ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Title" htmlFor="edit-title" error={errors.title?.message} hint="Leave blank for the role's default title.">
          <Input id="edit-title" autoComplete="off" {...register("title")} />
        </Field>
        <Field label="Email" required htmlFor="edit-email" error={errors.email?.message} hint="What they sign in with.">
          <Input id="edit-email" type="email" inputMode="email" autoComplete="off" {...register("email")} />
        </Field>
        <Field label="Phone" htmlFor="edit-phone" error={errors.phone?.message}>
          <Input id="edit-phone" inputMode="tel" autoComplete="off" {...register("phone")} />
        </Field>

        {error ? (
          <p className="flex items-start gap-2 text-sm text-danger">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={isSubmitting || busy !== null}>
            {busy === "save" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Save changes
          </Button>
        </div>
      </form>

      <div className="mt-2 space-y-2 rounded-2xl bg-zone p-3">
        <p className="meta-label">Login</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={resetPassword}>
            {busy === "reset" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
            Reset password
          </Button>
          {!isSelf ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={toggleActive}
              className={cn(row.isActive && "text-danger hover:text-danger")}
            >
              {busy === "active" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : row.isActive ? (
                <UserX className="size-4" aria-hidden />
              ) : (
                <UserCheck className="size-4" aria-hidden />
              )}
              {row.isActive ? "Switch off login" : "Switch on login"}
            </Button>
          ) : null}
        </div>

        {!isSelf && !isSuperAdmin ? (
          <div className="pt-1">
            {!confirmRemove ? (
              <Button type="button" size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => setConfirmRemove(true)}>
                <UserMinus className="size-4" aria-hidden />
                Remove from executive team
              </Button>
            ) : (
              <div className="space-y-3">
                <p className="text-[13px] text-muted-foreground">
                  Their executive record goes and the login is demoted to a plain worker login (which opens nothing on its own). The
                  login itself is kept.
                </p>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={alsoDeactivate}
                    onChange={(e) => setAlsoDeactivate(e.target.checked)}
                  />
                  Also switch off their login
                </label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                    Keep them
                  </Button>
                  <Button type="button" size="sm" variant="destructive" disabled={busy !== null} onClick={remove}>
                    {busy === "remove" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <UserMinus className="size-4" aria-hidden />}
                    Remove {row.fullName.split(" ")[0]}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}
