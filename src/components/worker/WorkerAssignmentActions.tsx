"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, CircleAlert } from "lucide-react";
import type { ProjectStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";

/** Accepting the assignment. Work itself is uploaded from the Documents tab. */
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

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/worker/projects/${projectCode}/accept`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "That action could not be completed.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  if (status !== "ASSIGNED") return null;

  return (
    <div className="rounded-2xl bg-zone p-4">
      <p className="text-sm text-foreground">
        Accept this assignment to start working. The deadline clock is already running.
      </p>
      <Button size="sm" className="mt-3" disabled={busy} onClick={accept}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Accept assignment
      </Button>
      {error ? (
        <p className="mt-3 flex items-start gap-2 text-sm text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
