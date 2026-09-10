"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { allowedTransitions, type TransitionCandidate, type TransitionRule } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

export interface ProjectActionState {
  /** The human EC-XXXXX code — used in the API path. */
  code: string;
  candidate: TransitionCandidate;
}

export function ProjectActions({ project }: { project: ProjectActionState }) {
  const router = useRouter();
  const { code, candidate } = project;
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [noteFor, setNoteFor] = React.useState<TransitionRule | null>(null);
  const [note, setNote] = React.useState("");

  const post = React.useCallback(
    async (key: string, path: string, body: unknown) => {
      setPending(key);
      setError(null);
      try {
        const res = await fetch(`/api/admin/projects/${code}/${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? "That action could not be completed.");
        }
        setNoteFor(null);
        setNote("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "That action could not be completed.");
      } finally {
        setPending(null);
      }
    },
    [code, router]
  );

  const runTransition = (rule: TransitionRule, withNote?: string) =>
    post(`t:${rule.to}`, "transition", { to: rule.to, note: withNote });

  const rules = allowedTransitions(candidate);
  const buttons: React.ReactNode[] = [];

  // Payment-leg verifications (these also advance the status server-side).
  if (candidate.downpaymentStatus === "Paid") {
    buttons.push(
      <Button
        key="verify-dp"
        size="sm"
        disabled={pending !== null}
        onClick={() => post("verify-dp", "verify-payment", { leg: "downpayment" })}
      >
        {pending === "verify-dp" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Verify downpayment
      </Button>
    );
  }
  if (candidate.balanceStatus === "Paid") {
    buttons.push(
      <Button
        key="verify-bal"
        size="sm"
        disabled={pending !== null}
        onClick={() => post("verify-bal", "verify-payment", { leg: "balance" })}
      >
        {pending === "verify-bal" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Verify balance
      </Button>
    );
  }

  if (candidate.status === "REQUIREMENTS_CONFIRMED") {
    buttons.push(
      <Button key="assign" asChild size="sm">
        <Link href={`/admin/projects/${code}/assign`}>Assign worker</Link>
      </Button>
    );
  }

  for (const rule of rules) {
    if (rule.external) continue;
    const blocked = rule.guard?.(candidate) ?? null;
    const key = `t:${rule.to}`;
    buttons.push(
      <Button
        key={key}
        size="sm"
        variant={rule.to === "REVISION_NEEDED" || rule.to === "SUPERVISOR_CORRECTIONS" ? "outline" : "default"}
        disabled={pending !== null || blocked !== null}
        title={blocked ?? undefined}
        onClick={() => (rule.requiresNote ? (setNoteFor(rule), setError(null)) : runTransition(rule))}
      >
        {pending === key ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {rule.action}
      </Button>
    );
  }

  if (buttons.length === 0 && !error) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Next step
        </span>
        {buttons}
      </div>

      {noteFor ? (
        <form
          className="space-y-2 rounded-lg border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            runTransition(noteFor, note.trim() || undefined);
          }}
        >
          <label htmlFor="transition-note" className="text-[13px] font-medium text-foreground">
            {noteFor.to === "AWAITING_CLIENT_INPUT"
              ? "What are you waiting on from the client?"
              : noteFor.to === "REVISION_NEEDED"
                ? "What needs to change?"
                : noteFor.to === "SUPERVISOR_CORRECTIONS"
                  ? "Supervisor correction details"
                  : "Add a note"}
          </label>
          <textarea
            id="transition-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-border bg-input p-2 text-sm text-foreground focus-visible:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending !== null}>
              {pending === `t:${noteFor.to}` ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              {noteFor.action}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setNoteFor(null);
                setNote("");
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p className={cn("flex items-start gap-2 text-sm text-danger")}>
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}

