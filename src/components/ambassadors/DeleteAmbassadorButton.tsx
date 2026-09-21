"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuLoaderCircle, LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Super Admin only (the API 403s an Ops Manager too). The server refuses once
 * the ambassador has jobs, referred clients or subs, and says to Terminate
 * instead; that message is shown here as-is.
 */
export function DeleteAmbassadorButton({ ambassadorId, fullName }: { ambassadorId: string; fullName: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function confirmDelete() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ambassadors/${ambassadorId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not delete this ambassador.");
      }
      router.push("/admin/ambassadors");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this ambassador.");
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {fullName}?</DialogTitle>
            <DialogDescription>
              This removes their ambassador record for good. It can&apos;t be undone. Their slot is emptied
              for the next applicant, and their login (if they have one) is switched off, not deleted. Only
              possible for someone with no jobs, referred clients or sub-ambassadors yet.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-danger">
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
