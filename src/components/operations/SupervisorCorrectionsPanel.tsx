"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuBellRing, LuCircleAlert, LuCircleCheck, LuLoaderCircle, LuTriangleAlert } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_CORRECTION_ROUNDS } from "@/lib/operations/corrections";
import { cn, formatDate } from "@/lib/utils";
import type { ProjectOps } from "@/lib/services/operations/project-ops";

/**
 * Supervisor corrections: which round this is, the client's note, the
 * deadline, and the history. Three rounds are in the service; the panel
 * says so plainly at the limit. Shown while the project is in
 * SUPERVISOR_CORRECTIONS (and, quietly, once rounds exist).
 */
export function SupervisorCorrectionsPanel({ code, rounds, inCorrections, hasWorker }: { code: string; rounds: ProjectOps["rounds"]; inCorrections: boolean; hasWorker: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const [escalating, setEscalating] = React.useState(false);
  const [note, setNote] = React.useState("");

  if (!inCorrections && rounds.length === 0) return null;

  const open = rounds.find((r) => r.status === "IN_PROGRESS") ?? null;
  const current = open?.roundNumber ?? rounds.length;
  const atLimit = rounds.length >= MAX_CORRECTION_ROUNDS;

  async function act(action: string, body?: unknown, success?: string) {
    setBusy(action);
    setError(null);
    setDone(null);
    try {
      const res = await fetch(`/api/admin/projects/${code}/corrections/${action}`, {
        method: "POST",
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "That action could not be completed.");
      }
      setEscalating(false);
      setNote("");
      if (success) setDone(success);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That action could not be completed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="corrections-heading" className={cn("space-y-4 rounded-2xl p-4 sm:p-5", inCorrections ? "bg-gold/10" : "bg-zone")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="corrections-heading" className="text-[15px] font-semibold text-foreground">
          Supervisor corrections{inCorrections ? ` — round ${Math.max(current, 1)} of ${MAX_CORRECTION_ROUNDS}` : ""}
        </h2>
        {!inCorrections ? <span className="text-[13px] text-muted-foreground">{rounds.length} round{rounds.length === 1 ? "" : "s"} so far</span> : null}
      </div>

      {open ? (
        <div className="space-y-1 text-sm">
          {open.clientNote ? (
            <p className="text-foreground">
              <span className="text-muted-foreground">Client note: </span>
              {open.clientNote}
            </p>
          ) : null}
          <p className="text-[13px] text-muted-foreground">
            Received {formatDate(open.receivedAt)}
            {open.deadline ? ` · due ${formatDate(open.deadline)}` : ""}
            {open.deadline && new Date(open.deadline) < new Date() ? <span className="text-danger"> · past due</span> : null}
          </p>
        </div>
      ) : null}

      <ol className="space-y-1.5 text-[13px]">
        {rounds.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
            <span className="font-medium text-foreground">Round {r.roundNumber}:</span>
            <span>received {formatDate(r.receivedAt)}</span>
            {r.status === "COMPLETED" ? (
              <span className="inline-flex items-center gap-1 text-success">
                <LuCircleCheck className="size-3.5" aria-hidden /> completed {formatDate(r.completedAt)}
              </span>
            ) : r.status === "ESCALATED" ? (
              <span className="inline-flex items-center gap-1 text-danger">
                <LuTriangleAlert className="size-3.5" aria-hidden /> escalated{r.escalationNote ? `: ${r.escalationNote}` : ""}
              </span>
            ) : (
              <span className="text-gold">in progress{r.deadline ? ` · deadline ${formatDate(r.deadline)}` : ""}</span>
            )}
          </li>
        ))}
        {rounds.length < MAX_CORRECTION_ROUNDS ? (
          <li className="text-subtle">
            Round {rounds.length + 1}: {rounds.length + 1 === MAX_CORRECTION_ROUNDS ? "(if needed — final round allowed)" : "(if needed)"}
          </li>
        ) : null}
      </ol>

      <p className={cn("text-[13px]", atLimit ? "font-medium text-danger" : "text-muted-foreground")}>
        {atLimit
          ? `This project has reached the ${MAX_CORRECTION_ROUNDS}-round correction limit. Further corrections are out of scope and require a new service order.`
          : `After ${MAX_CORRECTION_ROUNDS} rounds, corrections become out of scope and require a new service order.`}
      </p>

      {inCorrections ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy !== null || !hasWorker} onClick={() => void act("reminder", undefined, "Reminder sent to the worker")} title={hasWorker ? undefined : "No worker on this project"}>
            {busy === "reminder" ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuBellRing className="size-4" aria-hidden />}
            Send reminder
          </Button>
          <Button size="sm" disabled={busy !== null} onClick={() => void act("complete", undefined, "Corrections marked complete and re-delivered")}>
            {busy === "complete" ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuCircleCheck className="size-4" aria-hidden />}
            Mark corrections complete
          </Button>
          <Button size="sm" variant="outline" className="border-danger/40 text-danger hover:bg-danger/10" disabled={busy !== null} onClick={() => setEscalating((v) => !v)} aria-expanded={escalating}>
            <LuTriangleAlert className="size-4" aria-hidden />
            Escalate — out of scope
          </Button>
        </div>
      ) : null}

      {escalating ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void act("escalate", { note }, "Escalated to the founder");
          }}
        >
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why these corrections are beyond the order (the founder decides on a new service order)" aria-label="Escalation note" autoFocus />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy !== null || note.trim().length < 3}>
              {busy === "escalate" ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              Escalate
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEscalating(false)} disabled={busy !== null}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
      {done ? <p className="text-sm text-success">{done}</p> : null}
    </section>
  );
}
