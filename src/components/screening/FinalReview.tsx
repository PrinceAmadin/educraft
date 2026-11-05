"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuCircleCheck, LuCircleX, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { cn, formatDateTime } from "@/lib/utils";

interface ListRow {
  assessmentId: string;
  applicationId: string;
  candidate: string;
  reviewDecision: string | null;
  submittedAt: string | Date | null;
}

export function FinalReviewList({ rows }: { rows: ListRow[] }) {
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.assessmentId} className="surface flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{r.candidate}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{r.submittedAt ? `Submitted ${formatDateTime(r.submittedAt)}` : "Submitted"}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", r.reviewDecision === "PASS" ? "bg-success/15 text-success" : r.reviewDecision === "FAIL" ? "bg-danger/15 text-danger" : "bg-gold/15 text-gold")}>
              {r.reviewDecision ? (r.reviewDecision === "PASS" ? "Approved" : "Declined") : "Awaiting your review"}
            </span>
            <Link href={`/admin/workers/final?a=${r.assessmentId}`} className="text-sm font-medium text-primary hover:underline">
              {r.reviewDecision ? "View" : "Review"} →
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

interface VoiceFinding {
  rule: string;
  label: string;
  quote: string;
  severity: "MAJOR" | "MINOR";
  fix: string;
}
interface ChapterVoice {
  findings: VoiceFinding[];
  majorCount: number;
  total: number;
  empty: boolean;
}
interface Detail {
  assessmentId: string;
  candidate: string;
  email: string;
  reviewDecision: string | null;
  submittedAt: string | Date | null;
  briefs: { writing1: string; writing2: string; memo: string; prompt: string };
  chapter1Text: string | null;
  chapter2Text: string | null;
  memoResponse: string | null;
  promptResponse: string | null;
  voice: { chapter1: ChapterVoice; chapter2: ChapterVoice };
}

function Sample({ title, brief, text, voice }: { title: string; brief: string; text: string | null; voice: ChapterVoice }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="whitespace-pre-wrap text-xs text-muted-foreground">{brief}</p>
      <div className="surface p-3">
        <p className="meta-label">Their writing</p>
        {text ? (
          <p className="mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground">{text}</p>
        ) : (
          <p className="mt-1 flex items-center gap-2 text-sm text-danger">
            <LuCircleAlert className="size-4 shrink-0" aria-hidden /> Nothing uploaded.
          </p>
        )}
      </div>
      {text ? (
        <div className="surface p-3">
          <p className="meta-label">Voice scan — {voice.majorCount} strong tell{voice.majorCount === 1 ? "" : "s"}, {voice.total} note{voice.total === 1 ? "" : "s"} (advisory)</p>
          {voice.findings.length === 0 ? (
            <p className="mt-1 flex items-center gap-2 text-sm text-success">
              <LuCircleCheck className="size-4 shrink-0" aria-hidden /> No AI tells or banned phrases found.
            </p>
          ) : (
            <ul className="mt-1 space-y-1.5">
              {voice.findings.slice(0, 20).map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className={cn("mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium", f.severity === "MAJOR" ? "bg-danger/15 text-danger" : "bg-gold/15 text-gold")}>{f.label}</span>
                  <span className="min-w-0 flex-1 text-muted-foreground">&ldquo;{f.quote}&rdquo;</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}

function Answer({ title, brief, text }: { title: string; brief: string; text: string | null }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="whitespace-pre-wrap text-xs text-muted-foreground">{brief}</p>
      <div className="surface p-3">
        <p className="meta-label">Their answer</p>
        {text ? <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{text}</p> : <p className="mt-1 text-sm text-subtle">No answer given</p>}
      </div>
    </section>
  );
}

export function FinalReviewDetailView({ detail }: { detail: Detail }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [problem, setProblem] = React.useState<string | null>(null);
  const decided = detail.reviewDecision != null;

  const decide = async (decision: "PASS" | "FAIL") => {
    const ok = await confirm({
      title: decision === "PASS" ? `Approve ${detail.candidate} as a worker?` : `Decline ${detail.candidate}?`,
      description:
        decision === "PASS"
          ? "This creates their worker account and signs them in on their next login. They will watch the training videos before they can work."
          : "The application is declined and the candidate gets the usual polite email.",
      confirmLabel: decision === "PASS" ? "Approve" : "Decline",
      tone: decision === "FAIL" ? "danger" : "default",
    });
    if (!ok) return;
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/admin/workers/final/${detail.assessmentId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: note.trim() || undefined }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        setProblem(b?.error ?? "That did not save.");
        return;
      }
      router.push("/admin/workers/final");
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
        <p className="text-sm font-semibold text-foreground">{detail.candidate}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail.email}</p>
        {detail.reviewDecision ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Decided: <span className={detail.reviewDecision === "PASS" ? "text-success" : "text-danger"}>{detail.reviewDecision === "PASS" ? "Approved" : "Declined"}</span>
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Read the work and decide. The voice scan is advisory; your judgement is the gate.</p>
        )}
      </section>

      <Sample title="Part 1 — Introduction" brief={detail.briefs.writing1} text={detail.chapter1Text} voice={detail.voice.chapter1} />
      <Sample title="Part 2 — Literature review" brief={detail.briefs.writing2} text={detail.chapter2Text} voice={detail.voice.chapter2} />
      <Answer title="Part 3 — Reply to the supervisor" brief={detail.briefs.memo} text={detail.memoResponse} />
      <Answer title="Part 4 — Working without our tools" brief={detail.briefs.prompt} text={detail.promptResponse} />

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
              Approve as a worker
            </Button>
            <Button type="button" variant="outline" className="border-danger/40 text-danger hover:bg-danger/10" disabled={busy} onClick={() => void decide("FAIL")}>
              <LuCircleX className="size-4" aria-hidden />
              Decline
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
