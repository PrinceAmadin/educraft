"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuCircleCheck, LuCircleX, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { RELEVANCE_LABEL_TEXT, type RelevanceLabel } from "@/lib/screening/rules";
import { cn, formatDateTime } from "@/lib/utils";

interface ReviewRow {
  assignmentId: string;
  applicationId: string;
  candidate: string;
  overallPercent: number | null;
  outcome: string | null;
  reviewDecision: string | null;
  submittedAt: string | Date | null;
}

const OUTCOME_TONE: Record<string, string> = {
  PASS: "bg-success/15 text-success",
  FAIL: "bg-danger/15 text-danger",
  BORDERLINE: "bg-gold/15 text-gold",
};

export function ScreeningReviewList({ rows }: { rows: ReviewRow[] }) {
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const state = r.reviewDecision ?? r.outcome ?? "BORDERLINE";
        return (
          <li key={r.assignmentId} className="surface flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{r.candidate}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {r.submittedAt ? `Submitted ${formatDateTime(r.submittedAt)}` : "Submitted"}
                {r.overallPercent != null ? ` · scored ${r.overallPercent}%` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", OUTCOME_TONE[state] ?? OUTCOME_TONE.BORDERLINE)}>
                {r.reviewDecision ? `Decided: ${r.reviewDecision === "PASS" ? "Passed" : "Failed"}` : state === "BORDERLINE" ? "Borderline" : state === "PASS" ? "Auto pass" : "Auto fail"}
              </span>
              <Link href={`/admin/workers/screening?a=${r.assignmentId}`} className="text-sm font-medium text-primary hover:underline">
                {r.reviewDecision ? "View" : "Review"} →
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

interface EyeRow {
  id: string;
  text: string;
  source: string | null;
  isAI: boolean;
  choice: "AI" | "HUMAN" | null;
  tell: string | null;
  correct: boolean;
}
interface RelRow {
  source: { title: string; authors?: string | null; year?: number | null; journal?: string | null };
  correct: RelevanceLabel;
  chosen: RelevanceLabel | null;
  right: boolean;
}
interface RewriteDetail {
  original: string;
  answer: string;
  correct: number;
  total: number;
  remaining: number;
  tooShort: boolean;
  rulesLeft: { label: string; quote: string; fix: string }[];
  rubric: string | null;
}
interface Detail {
  assignmentId: string;
  candidate: string;
  email: string;
  outcome: string | null;
  reviewDecision: string | null;
  overallPercent: number | null;
  eyeCorrect: number | null;
  eyeTotal: number | null;
  relCorrect: number | null;
  relTotal: number | null;
  rewriteCorrect: number | null;
  rewriteTotal: number | null;
  submittedAt: string | Date | null;
  topic: string | null;
  eye: EyeRow[];
  rel: RelRow[];
  rewrite: RewriteDetail | null;
  format: { correct: number; total: number; uploaded: boolean; remaining: { id: string; ruleId: string; label: string; fix: string }[] } | null;
}

export function ScreeningReviewDetailView({ detail }: { detail: Detail }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [problem, setProblem] = React.useState<string | null>(null);

  const decided = detail.reviewDecision != null;

  const decide = async (decision: "PASS" | "FAIL") => {
    const ok = await confirm({
      title: decision === "PASS" ? `Pass ${detail.candidate}?` : `Fail ${detail.candidate}?`,
      description:
        decision === "PASS"
          ? "The application moves to the next stage."
          : "The application is declined and the candidate gets the usual polite email.",
      confirmLabel: decision === "PASS" ? "Pass" : "Fail",
      tone: decision === "FAIL" ? "danger" : "default",
    });
    if (!ok) return;
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/admin/workers/screening/${detail.assignmentId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: note.trim() || undefined }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setProblem(body?.error ?? "That did not save.");
        return;
      }
      router.push("/admin/workers/screening");
      router.refresh();
    } catch {
      setProblem("That did not save. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">{detail.candidate}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{detail.email}</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-lg font-semibold text-foreground">{detail.overallPercent ?? 0}%</p>
            <p className="text-xs text-muted-foreground">
              Spot AI {detail.eyeCorrect}/{detail.eyeTotal} · Sources {detail.relCorrect}/{detail.relTotal}
              {detail.rewrite ? ` · Rewrite ${detail.rewriteCorrect ?? 0}/${detail.rewriteTotal ?? 0}` : ""}
              {detail.format ? ` · Formatting ${detail.format.correct}/${detail.format.total}` : ""}
            </p>
          </div>
        </div>
        {detail.reviewDecision ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Decided: <span className={detail.reviewDecision === "PASS" ? "text-success" : "text-danger"}>{detail.reviewDecision === "PASS" ? "Passed" : "Failed"}</span>
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Automatic read: <span className={detail.outcome === "PASS" ? "text-success" : detail.outcome === "FAIL" ? "text-danger" : "text-gold"}>{detail.outcome}</span> — your call decides.
          </p>
        )}
      </section>

      {/* Part 1 — the AI calls and their tells */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Spot the AI — their answers and tells</h2>
        <ul className="space-y-2">
          {detail.eye.map((e, i) => (
            <li key={e.id} className="surface p-3">
              <div className="flex items-start gap-2">
                {e.correct ? (
                  <LuCircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                ) : (
                  <LuCircleX className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    {i + 1}. Was <span className="font-medium text-foreground">{e.isAI ? "AI" : "a person"}</span>; they said{" "}
                    <span className="font-medium text-foreground">{e.choice === "AI" ? "AI" : e.choice === "HUMAN" ? "a person" : "—"}</span>
                  </p>
                  {e.tell ? <p className="mt-1 text-sm text-foreground">Their tell: &ldquo;{e.tell}&rdquo;</p> : <p className="mt-1 text-sm text-subtle">No tell given</p>}
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{e.text}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Part 2 — the source classifications */}
      {detail.rel.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Judge the sources</h2>
          {detail.topic ? <p className="text-xs text-muted-foreground">Topic: {detail.topic}</p> : null}
          <ul className="divide-y divide-border/70">
            {detail.rel.map((r, i) => (
              <li key={i} className="flex items-start gap-2 py-2">
                {r.right ? (
                  <LuCircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                ) : (
                  <LuCircleX className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{r.source.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Correct: {RELEVANCE_LABEL_TEXT[r.correct]} · They said: {r.chosen ? RELEVANCE_LABEL_TEXT[r.chosen] : "—"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Part 3 — the rewrite */}
      {detail.rewrite ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">
            Rewrite — {detail.rewrite.correct}/{detail.rewrite.total} tells cleared
            {detail.rewrite.remaining > 0 ? `, ${detail.rewrite.remaining} still present` : ""}
          </h2>
          {detail.rewrite.tooShort ? (
            <p className="flex items-start gap-2 text-sm text-danger">
              <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              Too short to score — the content looks cut rather than rewritten.
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="surface p-3">
              <p className="meta-label">The AI paragraph</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{detail.rewrite.original}</p>
            </div>
            <div className="surface p-3">
              <p className="meta-label">Their rewrite</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{detail.rewrite.answer || "—"}</p>
            </div>
          </div>
          {detail.rewrite.rulesLeft.length > 0 ? (
            <div className="surface p-3">
              <p className="meta-label">Still in their rewrite</p>
              <ul className="mt-1 space-y-1.5">
                {detail.rewrite.rulesLeft.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <LuCircleX className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                    <span className="min-w-0 flex-1 text-foreground">
                      <span className="font-medium">{r.label}:</span> &ldquo;{r.quote}&rdquo;
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-success">
              <LuCircleCheck className="size-4 shrink-0" aria-hidden /> No banned constructions left in their rewrite.
            </p>
          )}
          {detail.rewrite.rubric ? <p className="text-sm text-muted-foreground">{detail.rewrite.rubric}</p> : null}
        </section>
      ) : null}

      {/* Part 4 — the formatting practical */}
      {detail.format ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">
            Formatting — {detail.format.correct}/{detail.format.total} faults fixed
          </h2>
          {!detail.format.uploaded ? (
            <p className="flex items-start gap-2 text-sm text-danger">
              <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              No document was uploaded.
            </p>
          ) : detail.format.remaining.length > 0 ? (
            <div className="surface p-3">
              <p className="meta-label">Still wrong in their document</p>
              <ul className="mt-1 space-y-1.5">
                {detail.format.remaining.map((r) => (
                  <li key={r.id} className="flex items-start gap-2 text-sm">
                    <LuCircleX className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                    <span className="min-w-0 flex-1 text-foreground">{r.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-success">
              <LuCircleCheck className="size-4 shrink-0" aria-hidden /> Every planted fault was fixed.
            </p>
          )}
        </section>
      ) : null}

      {!decided ? (
        <section className="surface space-y-3 p-4">
          <h2 className="text-sm font-semibold text-foreground">Your decision</h2>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="A note for the record (optional)"
            className="w-full rounded-lg border border-input-border bg-input p-2 text-sm text-foreground focus-visible:border-ring focus-visible:bg-card focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20"
          />
          {problem ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-danger">
              <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {problem}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="button" disabled={busy} onClick={() => void decide("PASS")}>
              {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuCircleCheck className="size-4" aria-hidden />}
              Pass
            </Button>
            <Button type="button" variant="outline" className="border-danger/40 text-danger hover:bg-danger/10" disabled={busy} onClick={() => void decide("FAIL")}>
              <LuCircleX className="size-4" aria-hidden />
              Fail
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
