"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuTrash2, LuCircleAlert, LuLoaderCircle, LuChevronDown, LuUserCog } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { WorkerPicker } from "@/components/workers/WorkerPicker";
import { cn } from "@/lib/utils";
import type { WorkerRecommendation } from "@/lib/services/workers";

interface BlockingProject {
  id: string;
  projectId: string;
  projectTitle: string | null;
  status: string;
}

const ASSIGNED_ERROR_HINT = "currently assigned to";

/**
 * One blocking project's row — collapsed to a summary, expands in place to a
 * search-and-pick worker list. Picking someone reassigns immediately and the
 * row reports itself resolved; nothing here navigates away from the dialog.
 */
function BlockingProjectRow({
  project,
  excludeWorkerId,
  onResolved,
}: {
  project: BlockingProject;
  excludeWorkerId: string;
  onResolved: (projectDbId: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [workers, setWorkers] = React.useState<WorkerRecommendation[] | null>(null);
  const [assigningId, setAssigningId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function toggle() {
    setError(null);
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (workers) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/projects/${encodeURIComponent(project.projectId)}/assignment-context`);
      const body = (await res.json().catch(() => null)) as
        | { recommendations?: WorkerRecommendation[]; error?: string }
        | null;
      if (!res.ok || !body) throw new Error(body?.error ?? "Could not load workers.");
      setWorkers((body.recommendations ?? []).filter((w) => w.id !== excludeWorkerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load workers.");
    } finally {
      setLoading(false);
    }
  }

  async function pick(worker: WorkerRecommendation) {
    setAssigningId(worker.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${encodeURIComponent(project.projectId)}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId: worker.id }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not reassign this project.");
      }
      onResolved(project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reassign this project.");
      setAssigningId(null);
    }
  }

  return (
    <div className="rounded-xl bg-zone p-3">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">
            <span className="font-mono">{project.projectId}</span>
            {project.projectTitle ? ` — ${project.projectTitle}` : ""}
          </span>
          <span className="block text-xs text-muted-foreground">{project.status}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-primary">
          <LuUserCog className="size-4" aria-hidden />
          Assign
          <LuChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
        </span>
      </button>

      {open ? (
        <div className="mt-3 border-t border-border pt-3">
          {loading ? (
            <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <LuLoaderCircle className="size-4 animate-spin" aria-hidden />
              Loading workers…
            </p>
          ) : workers ? (
            <WorkerPicker workers={workers} selectedId={assigningId} onPick={pick} />
          ) : null}
          {assigningId && loading === false && workers ? (
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden />
              Assigning…
            </p>
          ) : null}
          {error ? (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-danger">
              <LuCircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Super Admin only (enforced server-side too — the API 403s an Ops Manager).
 * An overlay confirm since it's the one truly destructive worker action;
 * everything else (Suspend/Terminate) keeps the record. When the worker is
 * still assigned somewhere, the blocking projects are listed right here with
 * an inline reassign picker, so clearing the way and retrying the delete
 * never means leaving this dialog.
 */
export function DeleteWorkerButton({ workerId, fullName }: { workerId: string; fullName: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [blocking, setBlocking] = React.useState<BlockingProject[] | null>(null);

  async function loadBlocking() {
    try {
      const res = await fetch(`/api/admin/workers/${workerId}/assignments`);
      const body = (await res.json().catch(() => null)) as { assignments?: BlockingProject[] } | null;
      setBlocking(body?.assignments ?? []);
    } catch {
      /* the confirm-delete error message still stands on its own */
    }
  }

  async function confirmDelete() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/workers/${workerId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        const message = data?.error ?? "Could not delete this worker.";
        if (message.includes(ASSIGNED_ERROR_HINT)) {
          await loadBlocking();
        }
        throw new Error(message);
      }
      router.push("/admin/workers");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this worker.");
      setPending(false);
    }
  }

  function onProjectResolved(projectDbId: string) {
    setBlocking((prev) => {
      const next = (prev ?? []).filter((p) => p.id !== projectDbId);
      if (next.length === 0) {
        // Everything's clear — finish what they came here to do.
        setError(null);
        void confirmDelete();
      }
      return next;
    });
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
          setBlocking(null);
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

          {blocking && blocking.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Reassign {blocking.length === 1 ? "this project" : "these projects"} to clear the way —
                deleting resumes automatically once none are left.
              </p>
              {blocking.map((project) => (
                <BlockingProjectRow
                  key={project.id}
                  project={project}
                  excludeWorkerId={workerId}
                  onResolved={onProjectResolved}
                />
              ))}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-danger text-danger-foreground hover:bg-danger/90"
              onClick={confirmDelete}
              disabled={pending || Boolean(blocking && blocking.length > 0)}
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
