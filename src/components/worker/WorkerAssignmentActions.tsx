"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, CircleAlert } from "lucide-react";
import type { ProjectStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/Field";

export function WorkerAssignmentActions({
  projectCode,
  status,
}: {
  projectCode: string;
  status: ProjectStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showSubmit, setShowSubmit] = React.useState(false);
  const [fileUrl, setFileUrl] = React.useState("");
  const [note, setNote] = React.useState("");

  async function call(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/worker/projects/${projectCode}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "That action could not be completed.");
      }
      setShowSubmit(false);
      setFileUrl("");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  if (status !== "ASSIGNED" && status !== "IN_PROGRESS" && status !== "REVISION_NEEDED") {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      {status === "ASSIGNED" ? (
        <>
          <p className="text-sm text-foreground">
            Accept this assignment to start working. The deadline clock is already running.
          </p>
          <Button size="sm" className="mt-3" disabled={busy} onClick={() => call("accept")}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Accept assignment
          </Button>
        </>
      ) : null}

      {status === "IN_PROGRESS" || status === "REVISION_NEEDED" ? (
        showSubmit ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (fileUrl.trim()) call("submit", { fileUrl: fileUrl.trim(), note: note.trim() });
            }}
          >
            <Field
              label="Link to your file"
              htmlFor="w-fileurl"
              hint="Google Drive, Dropbox, or wherever your document lives"
            >
              <Input
                id="w-fileurl"
                type="url"
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
                placeholder="https://…"
                required
              />
            </Field>
            <Field label="Note for QA (optional)" htmlFor="w-note">
              <textarea
                id="w-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-lg border border-border bg-input p-2 text-sm text-foreground focus-visible:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={busy || !fileUrl.trim()}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Submit for QA
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowSubmit(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <>
            <p className="text-sm text-foreground">
              {status === "REVISION_NEEDED"
                ? "Address the QA feedback, then submit the revised work."
                : "When your work is ready, submit it for QA review."}
            </p>
            <Button size="sm" className="mt-3" onClick={() => setShowSubmit(true)}>
              {status === "REVISION_NEEDED" ? "Submit revised work" : "Submit completed work"}
            </Button>
          </>
        )
      ) : null}

      {error ? (
        <p className="mt-3 flex items-start gap-2 text-sm text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
