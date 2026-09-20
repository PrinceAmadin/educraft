"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { allowedTransitions, type TransitionCandidate, type TransitionRule } from "@/lib/pipeline";

export interface ProjectActionState {
  /** The human EC-XXXXX code — used in the API path. */
  code: string;
  candidate: TransitionCandidate;
}

/**
 * The next legal pipeline moves for a project, set in a quiet zone band. The
 * state machine decides what appears here; this only renders and submits.
 */
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
        onClick={() =>
          rule.requiresNote
            ? (setNoteFor(rule), setError(null))
            : runTransition(rule)
        }
      >
        {pending === key ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
        {rule.action}
      </Button>
    );
  }

  // Payment verification lives in the Financials tab; nudge toward it when a
  // leg is paid but unverified.
  const paidUnverified = candidate.downpaymentStatus === "Paid" || candidate.balanceStatus === "Paid";

  // NEW with no downpayment yet has no button at all (verification is
  // external) — say so instead of leaving the page silent about why nothing
  // can be assigned yet.
  const waitingOnDownpayment = candidate.status === "NEW" && candidate.downpaymentStatus !== "Verified";

  if (buttons.length === 0 && !error && !paidUnverified && !waitingOnDownpayment) return null;

  return (
    <section aria-label="Next step" className="space-y-3 rounded-2xl bg-zone p-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="meta-label mr-2">Next step</span>
        {buttons}
        {waitingOnDownpayment && !paidUnverified ? (
          <span className="text-[13px] text-muted-foreground">
            Waiting on the client&apos;s downpayment — nothing to assign until it&apos;s verified.
          </span>
        ) : null}
        {paidUnverified ? (
          <Link
            href={`/admin/projects/${code}?tab=financials`}
            className="text-[13px] font-medium text-gold underline-offset-4 hover:underline"
          >
            A payment is awaiting verification — open Financials
          </Link>
        ) : null}
      </div>

      {noteFor ? (
        <form
          className="space-y-2.5 pt-1"
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
          <Textarea id="transition-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending !== null}>
              {pending === `t:${noteFor.to}` ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
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
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </section>
  );
}
