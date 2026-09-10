"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Loader2 } from "lucide-react";
import type { ProjectStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface WorkerOption {
  id: string;
  name: string;
}

export interface ProjectActionState {
  id: string;
  status: ProjectStatus;
  downpaymentStatus: string;
  balanceStatus: string;
  hasWorker: boolean;
}

type Pending = string | null;

export function ProjectActions({
  project,
  workers,
}: {
  project: ProjectActionState;
  workers: WorkerOption[];
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<Pending>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [assigning, setAssigning] = React.useState(false);
  const [workerId, setWorkerId] = React.useState("");

  const run = React.useCallback(
    async (key: string, path: string, body: unknown, method: "POST" | "PATCH" = "POST") => {
      setPending(key);
      setError(null);
      try {
        const res = await fetch(`/api/admin/projects/${project.id}/${path}`, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? "That action could not be completed.");
        }
        setAssigning(false);
        setWorkerId("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "That action could not be completed.");
      } finally {
        setPending(null);
      }
    },
    [project.id, router]
  );

  const actions: React.ReactNode[] = [];

  if (project.downpaymentStatus === "Paid") {
    actions.push(
      <Button
        key="verify-dp"
        size="sm"
        disabled={pending !== null}
        onClick={() => run("verify-dp", "verify-payment", { leg: "downpayment" })}
      >
        {pending === "verify-dp" ? <Loader2 className="size-4 animate-spin" /> : null}
        Verify downpayment
      </Button>
    );
  }

  if (project.balanceStatus === "Paid") {
    actions.push(
      <Button
        key="verify-bal"
        size="sm"
        disabled={pending !== null}
        onClick={() => run("verify-bal", "verify-payment", { leg: "balance" })}
      >
        {pending === "verify-bal" ? <Loader2 className="size-4 animate-spin" /> : null}
        Verify balance
      </Button>
    );
  }

  if (project.status === "REQUIREMENTS_CONFIRMED") {
    actions.push(
      assigning ? (
        <form
          key="assign"
          className="flex w-full flex-wrap items-center gap-2 sm:w-auto"
          onSubmit={(e) => {
            e.preventDefault();
            if (workerId) run("assign", "assign", { workerId });
          }}
        >
          <Select
            value={workerId}
            onChange={(e) => setWorkerId(e.target.value)}
            className="h-9 w-full text-sm sm:w-56"
            aria-label="Select a worker"
            required
          >
            <option value="">Select a worker…</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
          <Button type="submit" size="sm" disabled={!workerId || pending !== null}>
            {pending === "assign" ? <Loader2 className="size-4 animate-spin" /> : null}
            Confirm
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setAssigning(false);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <Button key="assign" size="sm" onClick={() => setAssigning(true)} disabled={pending !== null}>
          Assign worker
        </Button>
      )
    );
  }

  if (project.status === "SUBMITTED") {
    actions.push(
      <Button
        key="to-qa"
        size="sm"
        disabled={pending !== null}
        onClick={() => run("to-qa", "transition", { to: "IN_QA_REVIEW" })}
      >
        {pending === "to-qa" ? <Loader2 className="size-4 animate-spin" /> : null}
        Move to QA
      </Button>
    );
  }

  if (project.status === "IN_QA_REVIEW") {
    actions.push(
      <Button
        key="approve"
        size="sm"
        disabled={pending !== null}
        onClick={() => run("approve", "transition", { to: "APPROVED" })}
      >
        {pending === "approve" ? <Loader2 className="size-4 animate-spin" /> : null}
        Approve
      </Button>,
      <Button
        key="revise"
        size="sm"
        variant="outline"
        disabled={pending !== null}
        onClick={() => run("revise", "transition", { to: "REVISION_NEEDED" })}
      >
        Request revision
      </Button>
    );
  }

  if (project.status === "BALANCE_VERIFIED") {
    actions.push(
      <Button
        key="deliver"
        size="sm"
        disabled={pending !== null}
        onClick={() => run("deliver", "transition", { to: "DELIVERED" })}
      >
        {pending === "deliver" ? <Loader2 className="size-4 animate-spin" /> : null}
        Deliver
      </Button>
    );
  }

  if (actions.length === 0 && !error) return null;

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-3 sm:p-4",
        "flex flex-col gap-3"
      )}
    >
      {actions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Next step
          </span>
          {actions}
        </div>
      ) : null}

      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
