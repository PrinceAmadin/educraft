"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuTrash2, LuCircleAlert, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

/**
 * Super Admin only (enforced server-side too — the API 403s an Ops Manager).
 * An overlay confirm since it's the one truly destructive worker action;
 * everything else (Suspend/Terminate) keeps the record.
 */
export function DeleteWorkerButton({ workerId, fullName }: { workerId: string; fullName: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
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

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="text-danger hover:bg-danger/10"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <LuTrash2 className="size-4" aria-hidden />
        Delete
      </Button>

      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {fullName}?</DialogTitle>
            <DialogDescription>
              This removes their worker record for good — it can&apos;t be undone. Their portal login
              (if they have one) is deactivated, not deleted.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <p className="flex items-start gap-2 text-sm text-danger">
              <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-danger text-danger-foreground hover:bg-danger/90"
              onClick={confirmDelete}
              disabled={pending}
            >
              {pending ? (
                <LuLoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : (
                <LuTrash2 className="size-4" aria-hidden />
              )}
              Confirm delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
