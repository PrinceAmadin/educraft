"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuCircleCheck, LuClock, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import {
  RELEVANCE_LABELS,
  RELEVANCE_LABEL_TEXT,
  SCREENING_TEXT,
  type RelevanceLabel,
} from "@/lib/screening/rules";
import { cn } from "@/lib/utils";

interface CandidateEye {
  id: string;
  text: string;
  source: string | null;
}
interface CandidateRel {
  topic: string;
  sources: { title: string; authors?: string | null; year?: number | null; journal?: string | null; abstract?: string | null }[];
}
interface View {
  status: "SENT" | "IN_PROGRESS" | "SUBMITTED";
  minutes: number;
  deadlineAt: string | Date | null;
  expired: boolean;
  eye: CandidateEye[];
  rel: CandidateRel | null;
}

/**
 * The candidate's screening: an intro and the clock, then the two tests (spot
 * the AI, judge the sources), then a thank-you. The clock starts server-side;
 * this page only counts it down and nudges a submit when it runs out. Scoring
 * is entirely on the server — no answer ever reaches the browser.
 */
export function ScreeningTest({ token, view }: { token: string; view: View }) {
  const router = useRouter();

  if (view.status === "SUBMITTED") {
    return (
      <section className="rounded-xl bg-zone p-6 text-center">
        <LuCircleCheck className="mx-auto size-8 text-primary" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold text-foreground">{SCREENING_TEXT.doneTitle}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{SCREENING_TEXT.doneBody}</p>
      </section>
    );
  }

  if (view.status === "SENT") {
    return <Intro token={token} minutes={view.minutes} onStarted={() => router.refresh()} />;
  }

  return <InProgress token={token} view={view} onSubmitted={() => router.refresh()} />;
}

function Intro({ token, minutes, onStarted }: { token: string; minutes: number; onStarted: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/screen/${token}/start`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setProblem(body?.error ?? SCREENING_TEXT.submitError);
        return;
      }
      onStarted();
    } catch {
      setProblem(SCREENING_TEXT.submitError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground">{SCREENING_TEXT.introTitle}</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">{SCREENING_TEXT.introBody}</p>
      <div className="flex items-start gap-2 rounded-xl bg-zone p-4 text-sm text-foreground">
        <LuClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        {SCREENING_TEXT.timeNote(minutes)}
      </div>
      {problem ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {problem}
        </p>
      ) : null}
      <Button type="button" onClick={() => void start()} disabled={busy}>
        {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
        {SCREENING_TEXT.startLabel}
      </Button>
    </section>
  );
}

function InProgress({ token, view, onSubmitted }: { token: string; view: View; onSubmitted: () => void }) {
  const [eye, setEye] = React.useState<Record<string, { choice: "AI" | "HUMAN"; tell: string }>>({});
  const [rel, setRel] = React.useState<Record<string, RelevanceLabel>>({});
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [remaining, setRemaining] = React.useState<number | null>(null);
  const submittedRef = React.useRef(false);

  const submit = React.useCallback(
    async (auto: boolean) => {
      if (submittedRef.current) return;
      if (!auto) {
        const allEye = view.eye.every((e) => eye[e.id]?.choice);
        const allRel = !view.rel || view.rel.sources.every((_, i) => rel[String(i)]);
        if (!allEye || !allRel) {
          setProblem(SCREENING_TEXT.answerAll);
          return;
        }
      }
      submittedRef.current = true;
      setBusy(true);
      setProblem(null);
      try {
        const res = await fetch(`/api/screen/${token}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eye, rel }),
        });
        if (!res.ok) {
          submittedRef.current = false;
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          setProblem(body?.error ?? SCREENING_TEXT.submitError);
          return;
        }
        onSubmitted();
      } catch {
        submittedRef.current = false;
        setProblem(SCREENING_TEXT.submitError);
      } finally {
        setBusy(false);
      }
    },
    [token, eye, rel, view.eye, view.rel, onSubmitted]
  );

  // Count the clock down and submit what they have when it runs out.
  React.useEffect(() => {
    if (view.deadlineAt == null) return;
    const deadline = new Date(view.deadlineAt).getTime();
    const tick = () => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) void submit(true);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [view.deadlineAt, submit]);

  const mm = remaining != null ? Math.floor(remaining / 60) : null;
  const ss = remaining != null ? remaining % 60 : null;

  return (
    <div className="space-y-8">
      {remaining != null ? (
        <div
          className={cn(
            "sticky top-2 z-10 flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-sm shadow-soft",
            remaining < 120 ? "text-danger" : "text-foreground"
          )}
        >
          <LuClock className="size-4 shrink-0" aria-hidden />
          <span className="font-mono tabular-nums">
            {mm}:{String(ss).padStart(2, "0")}
          </span>
          <span className="text-muted-foreground">left</span>
        </div>
      ) : null}

      {/* Part 1 — Spot the AI */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">{SCREENING_TEXT.eyeTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{SCREENING_TEXT.eyeBody}</p>
        </div>
        <ol className="space-y-5">
          {view.eye.map((item, i) => (
            <li key={item.id} className="rounded-xl bg-zone p-4">
              <p className="text-sm leading-relaxed text-foreground">
                <span className="font-semibold">{i + 1}.</span> {item.text}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["HUMAN", "AI"] as const).map((choice) => {
                  const checked = eye[item.id]?.choice === choice;
                  return (
                    <label
                      key={choice}
                      className={cn(
                        "flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg px-4 text-sm transition-colors",
                        checked ? "bg-card font-medium text-foreground shadow-soft" : "bg-card/50 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <input
                        type="radio"
                        name={`eye-${item.id}`}
                        className="size-4 accent-primary"
                        checked={checked}
                        onChange={() => setEye((e) => ({ ...e, [item.id]: { choice, tell: e[item.id]?.tell ?? "" } }))}
                      />
                      {choice === "AI" ? SCREENING_TEXT.eyeChoiceAI : SCREENING_TEXT.eyeChoiceHuman}
                    </label>
                  );
                })}
              </div>
              <label className="mt-3 block">
                <span className="meta-label">{SCREENING_TEXT.eyeTellLabel}</span>
                <input
                  type="text"
                  value={eye[item.id]?.tell ?? ""}
                  onChange={(ev) =>
                    setEye((e) => ({ ...e, [item.id]: { choice: e[item.id]?.choice ?? "HUMAN", tell: ev.target.value } }))
                  }
                  maxLength={500}
                  placeholder={SCREENING_TEXT.eyeTellPlaceholder}
                  className="mt-1 h-11 w-full rounded-lg bg-card px-3 text-sm text-foreground shadow-soft outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
            </li>
          ))}
        </ol>
      </section>

      {/* Part 2 — Judge the sources */}
      {view.rel ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">{SCREENING_TEXT.relTitle}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{SCREENING_TEXT.relBody}</p>
          </div>
          <div className="rounded-xl bg-zone p-4">
            <p className="meta-label">{SCREENING_TEXT.relTopicLabel}</p>
            <p className="mt-1 text-sm font-medium text-foreground">{view.rel.topic}</p>
          </div>
          <ol className="space-y-3">
            {view.rel.sources.map((s, i) => (
              <li key={i} className="rounded-xl bg-zone p-4">
                <p className="text-sm font-medium text-foreground">
                  {i + 1}. {s.title}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[s.authors, s.year, s.journal].filter(Boolean).join(" · ")}
                </p>
                {s.abstract ? <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.abstract}</p> : null}
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {RELEVANCE_LABELS.map((label) => {
                    const checked = rel[String(i)] === label;
                    return (
                      <label
                        key={label}
                        className={cn(
                          "flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg px-3 text-sm transition-colors",
                          checked ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <input
                          type="radio"
                          name={`rel-${i}`}
                          className="sr-only"
                          checked={checked}
                          onChange={() => setRel((r) => ({ ...r, [String(i)]: label }))}
                        />
                        {RELEVANCE_LABEL_TEXT[label]}
                      </label>
                    );
                  })}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {problem ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {problem}
        </p>
      ) : null}

      <div className="pb-10">
        <Button type="button" onClick={() => void submit(false)} disabled={busy}>
          {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          {busy ? SCREENING_TEXT.submitting : SCREENING_TEXT.submitLabel}
        </Button>
      </div>
    </div>
  );
}
