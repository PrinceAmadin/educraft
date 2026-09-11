"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Loader2, Plus, UserX, UserCheck } from "lucide-react";
import { LuUsers } from "react-icons/lu";
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
import { createTeamMemberSchema, type CreateTeamMemberInput } from "@/lib/validations/settings";
import type { TeamMemberRow } from "@/lib/services/team";
import { formatDate } from "@/lib/utils";

const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: "Super Admin", OPS_MANAGER: "Ops Manager" };

export function TeamManager({
  team,
  canManage,
  currentUserId,
}: {
  team: TeamMemberRow[];
  canManage: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [rowError, setRowError] = React.useState<string | null>(null);

  async function toggleActive(row: TeamMemberRow) {
    setBusyId(row.id);
    setRowError(null);
    try {
      const res = await fetch(`/api/admin/settings/team/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !row.isActive }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "That could not be updated.");
      }
      router.refresh();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "That could not be updated.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" aria-hidden />
            Add admin
          </Button>
        </div>
      ) : null}

      {rowError ? (
        <p className="flex items-start gap-2 text-sm text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {rowError}
        </p>
      ) : null}

      {team.length === 0 ? (
        <EmptyState icon={LuUsers} title="No admin accounts" description="Add the first team member." />
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {team.map((m) => (
              <div key={m.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {m.displayName ?? m.email}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                  </div>
                  <Badge variant={m.isActive ? "success" : "neutral"}>
                    {m.isActive ? "Active" : "Deactivated"}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{ROLE_LABEL[m.role] ?? m.role}</span>
                  <span>Added {formatDate(m.createdAt)}</span>
                </div>
                {canManage ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 w-full"
                    disabled={busyId === m.id || (m.id === currentUserId && m.isActive)}
                    onClick={() => toggleActive(m)}
                  >
                    {busyId === m.id ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : m.isActive ? (
                      <UserX className="size-4" aria-hidden />
                    ) : (
                      <UserCheck className="size-4" aria-hidden />
                    )}
                    {m.isActive ? "Deactivate" : "Reactivate"}
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
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 font-medium">Added</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  {canManage ? <th className="px-4 py-2.5 font-medium" /> : null}
                </tr>
              </thead>
              <tbody>
                {team.map((m) => (
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {m.displayName ?? "—"}
                      {m.id === currentUserId ? (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{m.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">{ROLE_LABEL[m.role] ?? m.role}</td>
                    <td className="px-4 py-3 font-mono text-xs tabular-nums text-muted-foreground">
                      {formatDate(m.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={m.isActive ? "success" : "neutral"}>
                        {m.isActive ? "Active" : "Deactivated"}
                      </Badge>
                    </td>
                    {canManage ? (
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === m.id || (m.id === currentUserId && m.isActive)}
                          onClick={() => toggleActive(m)}
                          className={m.isActive ? "text-danger hover:text-danger" : ""}
                        >
                          {busyId === m.id ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                          ) : m.isActive ? (
                            <UserX className="size-4" aria-hidden />
                          ) : (
                            <UserCheck className="size-4" aria-hidden />
                          )}
                          {m.isActive ? "Deactivate" : "Reactivate"}
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          {addOpen ? (
            <AddTeamMemberForm
              onDone={() => {
                setAddOpen(false);
                router.refresh();
              }}
              onCancel={() => setAddOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddTeamMemberForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateTeamMemberInput>({
    resolver: zodResolver(createTeamMemberSchema),
    defaultValues: { email: "", displayName: "", phone: "", password: "", role: "OPS_MANAGER" },
  });

  const onSubmit = async (data: CreateTeamMemberInput) => {
    setSubmitError(null);
    try {
      const res = await fetch("/api/admin/settings/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not add this admin.");
      }
      onDone();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not add this admin.");
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add an admin</DialogTitle>
        <DialogDescription>They can sign in immediately with this password.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Field label="Full name" required htmlFor="displayName" error={errors.displayName?.message}>
          <Input id="displayName" autoComplete="off" {...register("displayName")} />
        </Field>
        <Field label="Email" required htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" inputMode="email" autoComplete="off" {...register("email")} />
        </Field>
        <Field label="Phone" htmlFor="phone" error={errors.phone?.message}>
          <Input id="phone" inputMode="tel" autoComplete="off" {...register("phone")} />
        </Field>
        <Field label="Role" required htmlFor="role" error={errors.role?.message}>
          <Select id="role" {...register("role")}>
            <option value="OPS_MANAGER">Ops Manager</option>
            <option value="SUPER_ADMIN">Super Admin</option>
          </Select>
        </Field>
        <Field
          label="Password"
          required
          htmlFor="password"
          error={errors.password?.message}
          hint="At least 8 characters — share it with them securely"
        >
          <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
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
            Add admin
          </Button>
        </div>
      </form>
    </>
  );
}
