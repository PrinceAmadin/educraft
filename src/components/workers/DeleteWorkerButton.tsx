"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuTrash2, LuCircleAlert, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";

/**
 * Super Admin only (enforced server-side too — the API 403s an Ops Manager).
 * A confirm step guards this since it's the one truly destructive worker
 * action; everything else (Suspend/Terminate) keeps the record.
 */
export function DeleteWorkerButton({ workerId, fullName }: { workerId: string; fullName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function confirmDelete() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/workers/${workerId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not delete this worker.");
      }
      router.push("/admin/workers");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this worker.");
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <Button type="button" size="sm" variant="outline" className="text-danger hover:bg-danger/10" onClick={() => setConfirming(true)}>
        <LuTrash2 className="size-4" aria-hidden />
        Delete
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Delete {fullName}? This can&apos;t be undone.</span>
        <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(false)} disabled={pending}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          className="bg-danger text-danger-foreground hover:bg-danger/90"
          onClick={confirmDelete}
          disabled={pending}
        >
          {pending ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuTrash2 className="size-4" aria-hidden />}
          Confirm delete
        </Button>
      </div>
      {error ? (
        <p className="flex items-center gap-1 text-xs text-danger">
          <LuCircleAlert className="size-3.5" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
