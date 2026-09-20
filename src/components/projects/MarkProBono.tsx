"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuGift, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/Field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Super admin: turn this project into a free (pro bono) one. One-way. */
export function MarkProBono({ projectCode }: { projectCode: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${projectCode}/probono`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not mark this project pro bono.");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark this project pro bono.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <LuGift className="size-4" aria-hidden />
        Mark as pro bono
      </Button>

      <Dialog open={open} onOpenChange={(v) => (busy ? null : setOpen(v))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Make this project pro bono</DialogTitle>
            <DialogDescription>
              The price becomes zero, the payments are cleared, any ambassador commission is released, and
              the project leaves the finance figures. This cannot be undone from here.
            </DialogDescription>
          </DialogHeader>

          <Field label="Why is this pro bono?" required htmlFor="pb-reason" hint="Only admins see this.">
            <Input
              id="pb-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Marketing, visibility, a partnership"
            />
          </Field>

          {error ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-danger">
              <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy || reason.trim().length < 3} onClick={submit}>
              {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              Mark pro bono
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
