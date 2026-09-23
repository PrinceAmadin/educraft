"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuLoaderCircle, LuMessageCircle, LuPlus } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ACCESS_LABELS, DELIVERABLE_ACCESS } from "@/lib/validations/deliverables";

/** Adds a document of the admin's own naming to the project's list (e.g. "Questionnaire"). */
export function AddDeliverableForm({ projectCode, isSuperAdmin }: { projectCode: string; isSuperAdmin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [access, setAccess] = React.useState<(typeof DELIVERABLE_ACCESS)[number]>("BALANCE");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${encodeURIComponent(projectCode)}/deliverables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, access }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Couldn't add it. Try again.");
      }
      setTitle("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add it. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <LuPlus aria-hidden />
        Add a document
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-xl space-y-3 rounded-2xl bg-zone p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="new-doc-title" className="meta-label">
            Name the client sees
          </label>
          <Input
            id="new-doc-title"
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Questionnaire"
            required
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="new-doc-access" className="meta-label">
            Client can download it
          </label>
          <Select id="new-doc-access" value={access} onChange={(e) => setAccess(e.target.value as typeof access)}>
            {DELIVERABLE_ACCESS.map((a) => (
              <option key={a} value={a} disabled={a === "ALWAYS" && !isSuperAdmin}>
                {ACCESS_LABELS[a]}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger" role="alert">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !title.trim()}>
          {busy ? <LuLoaderCircle className="animate-spin" aria-hidden /> : null}
          Add
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Shows the finished research in the client's Documents tab, or stops showing it. */
export function ResearchShareControl({
  projectCode,
  shared,
  clientFirstName,
}: {
  projectCode: string;
  shared: boolean;
  clientFirstName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [waUrl, setWaUrl] = React.useState<string | null>(null);

  async function toggle(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${encodeURIComponent(projectCode)}/research/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shared: next }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; whatsappUrl?: string | null } | null;
      if (!res.ok) throw new Error(data?.error ?? "That didn't go through. Try again.");
      setWaUrl(next ? data?.whatsappUrl ?? null : null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {shared ? (
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => toggle(false)}>
            {busy ? <LuLoaderCircle className="animate-spin" aria-hidden /> : null}
            Stop showing it to the client
          </Button>
        ) : (
          <Button type="button" size="sm" disabled={busy} onClick={() => toggle(true)}>
            {busy ? <LuLoaderCircle className="animate-spin" aria-hidden /> : null}
            Share the research with the client
          </Button>
        )}
        {waUrl ? (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-success/10 px-3 text-sm font-medium text-success transition-colors hover:bg-success/15"
          >
            <LuMessageCircle className="size-4" aria-hidden />
            Shared. Tell {clientFirstName} on WhatsApp
          </a>
        ) : null}
      </div>
      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger" role="alert">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
