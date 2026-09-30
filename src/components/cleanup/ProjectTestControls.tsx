"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuFlaskConical, LuFlaskConicalOff, LuLoaderCircle, LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/Field";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DeleteProjectsDialog } from "@/components/cleanup/DeleteProjectsDialog";
import { formatDate } from "@/lib/utils";

export interface ProjectFlag {
  at: string;
  byName: string | null;
  note: string | null;
}

/**
 * On a project's page: the "Flagged as test" chip, Flag / Unflag for anyone
 * who may flag, and Delete for the founder alone (the delete API refuses
 * everyone else whatever this shows).
 */
export function ProjectTestControls({
  code,
  flag,
  canFlag,
  canUnflag,
  canDelete,
}: {
  code: string;
  flag: ProjectFlag | null;
  canFlag: boolean;
  canUnflag: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [flagOpen, setFlagOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function send(method: "POST" | "DELETE") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/test-flags", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(method === "POST" ? { code, note: note.trim() || undefined } : { code }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "That could not be saved.");
      setFlagOpen(false);
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  if (!canFlag && !canDelete && !flag) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {flag ? (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-gold/10 px-2.5 py-0.5 text-xs font-medium text-gold"
          title={`Flagged by ${flag.byName ?? "someone"} on ${formatDate(flag.at)}${flag.note ? `: ${flag.note}` : ""}`}
        >
          <LuFlaskConical className="size-3.5" aria-hidden />
          Flagged as test
        </span>
      ) : null}

      {flag && canUnflag ? (
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => send("DELETE")}>
          {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuFlaskConicalOff className="size-4" aria-hidden />}
          Unflag
        </Button>
      ) : null}
      {!flag && canFlag ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setError(null);
            setFlagOpen(true);
          }}
        >
          <LuFlaskConical className="size-4" aria-hidden />
          Flag as test
        </Button>
      ) : null}
      {canDelete ? (
        <Button type="button" size="sm" variant="outline" className="text-danger hover:bg-danger/10" onClick={() => setDeleteOpen(true)}>
          <LuTrash2 className="size-4" aria-hidden />
          Delete
        </Button>
      ) : null}

      {error && !flagOpen ? (
        <p role="alert" className="basis-full text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Dialog open={flagOpen} onOpenChange={(next) => !busy && setFlagOpen(next)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Flag {code} as a test?</DialogTitle>
            <DialogDescription>
              It goes to the top of the founder&apos;s cleanup list. Nothing is removed unless the founder deletes it.
            </DialogDescription>
          </DialogHeader>
          <Field label="Note for the founder" htmlFor="flag-note" hint="Optional: who made it and why.">
            <Textarea id="flag-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} />
          </Field>
          {error ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-danger">
              <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setFlagOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => send("POST")}>
              {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuFlaskConical className="size-4" aria-hidden />}
              Flag as test
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {canDelete ? (
        <DeleteProjectsDialog
          codes={[code]}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          onFinished={(results) => {
            if (results.some((r) => r.ok && r.code === code)) router.push("/admin/projects");
            else router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
