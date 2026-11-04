"use client";

import * as React from "react";
import { LuCircleAlert, LuCircleCheck, LuCircleX, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { TRAINING_TEXT } from "@/lib/training/rules";
import { cn } from "@/lib/utils";

interface ViewerQuestion {
  id: string;
  prompt: string;
  options: { key: number; text: string }[];
}

interface QuizResult {
  questionId: string;
  prompt: string;
  options: string[];
  chosen: number | null;
  correctIndex: number;
  correct: boolean;
  explanation: string | null;
}

interface Outcome {
  score: number;
  total: number;
  passed: boolean;
  passPercent: number;
  results: QuizResult[];
}

/**
 * The quiz a worker takes after an episode. It fetches its own questions (the
 * answers are never sent down), scores on the server, and shows which answers
 * were right along with any explanation. On a pass it tells the parent, which
 * refreshes so the next episode unlocks. Unlimited attempts — "Try again"
 * re-fetches, so the questions and options are shuffled afresh.
 */
export function QuizPanel({ videoId, onPassed }: { videoId: string; onPassed: () => void }) {
  const [questions, setQuestions] = React.useState<ViewerQuestion[] | null>(null);
  const [answers, setAnswers] = React.useState<Record<string, number>>({});
  const [outcome, setOutcome] = React.useState<Outcome | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setProblem(null);
    setOutcome(null);
    setAnswers({});
    try {
      const res = await fetch(`/api/worker/training/${videoId}/quiz`, { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { questions?: ViewerQuestion[] } | null;
      if (!res.ok || !body?.questions) {
        setProblem(TRAINING_TEXT.quizError);
        return;
      }
      setQuestions(body.questions);
    } catch {
      setProblem(TRAINING_TEXT.quizError);
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const allAnswered = questions != null && questions.every((q) => answers[q.id] !== undefined);

  const submit = async () => {
    if (!allAnswered) {
      setProblem(TRAINING_TEXT.quizAnswerAll);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/worker/training/${videoId}/quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const body = (await res.json().catch(() => null)) as Outcome | null;
      if (!res.ok || !body) {
        setProblem(TRAINING_TEXT.quizError);
        return;
      }
      setOutcome(body);
      if (body.passed) onPassed();
    } catch {
      setProblem(TRAINING_TEXT.quizError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl bg-zone p-4">
      <h3 className="text-sm font-semibold text-foreground">{TRAINING_TEXT.quizTitle}</h3>
      <p className="mt-0.5 text-sm text-muted-foreground">{TRAINING_TEXT.quizIntro}</p>

      {loading ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Loading…
        </p>
      ) : null}

      {outcome ? (
        <QuizResults outcome={outcome} onRetry={() => void load()} />
      ) : questions ? (
        <>
          <ol className="mt-3 space-y-4">
            {questions.map((q, i) => (
              <li key={q.id}>
                <p className="text-sm font-medium text-foreground">
                  {i + 1}. {q.prompt}
                </p>
                <div className="mt-2 space-y-1.5">
                  {q.options.map((o) => {
                    const checked = answers[q.id] === o.key;
                    return (
                      <label
                        key={o.key}
                        className={cn(
                          "flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                          checked ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:bg-card/70"
                        )}
                      >
                        <input
                          type="radio"
                          name={q.id}
                          className="size-4 shrink-0 accent-primary"
                          checked={checked}
                          onChange={() => setAnswers((a) => ({ ...a, [q.id]: o.key }))}
                        />
                        <span>{o.text}</span>
                      </label>
                    );
                  })}
                </div>
              </li>
            ))}
          </ol>

          {problem ? (
            <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-danger">
              <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {problem}
            </p>
          ) : null}

          <div className="mt-4">
            <Button type="button" onClick={() => void submit()} disabled={busy || !allAnswered}>
              {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              {busy ? TRAINING_TEXT.quizSubmitting : TRAINING_TEXT.quizSubmit}
            </Button>
          </div>
        </>
      ) : problem ? (
        <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {problem}
        </p>
      ) : null}
    </section>
  );
}

function QuizResults({ outcome, onRetry }: { outcome: Outcome; onRetry: () => void }) {
  return (
    <div className="mt-3 space-y-4">
      <p
        className={cn(
          "flex items-center gap-2 text-sm font-medium",
          outcome.passed ? "text-success" : "text-danger"
        )}
      >
        {outcome.passed ? (
          <LuCircleCheck className="size-4 shrink-0" aria-hidden />
        ) : (
          <LuCircleX className="size-4 shrink-0" aria-hidden />
        )}
        {outcome.passed ? TRAINING_TEXT.quizPassed : TRAINING_TEXT.quizFailed}
        <span className="font-normal text-muted-foreground">
          ({outcome.score} of {outcome.total})
        </span>
      </p>

      <ol className="space-y-3">
        {outcome.results.map((r, i) => (
          <li key={r.questionId} className="rounded-lg bg-card p-3 shadow-soft">
            <p className="text-sm font-medium text-foreground">
              {i + 1}. {r.prompt}
            </p>
            <p
              className={cn(
                "mt-1 flex items-center gap-1.5 text-sm",
                r.correct ? "text-success" : "text-danger"
              )}
            >
              {r.correct ? (
                <LuCircleCheck className="size-4 shrink-0" aria-hidden />
              ) : (
                <LuCircleX className="size-4 shrink-0" aria-hidden />
              )}
              {r.correct
                ? TRAINING_TEXT.quizCorrect
                : `${TRAINING_TEXT.quizWrong} · ${TRAINING_TEXT.quizRightAnswer}: ${r.options[r.correctIndex] ?? ""}`}
            </p>
            {r.explanation ? <p className="mt-1 text-sm text-muted-foreground">{r.explanation}</p> : null}
          </li>
        ))}
      </ol>

      {!outcome.passed ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          {TRAINING_TEXT.quizTryAgain}
        </Button>
      ) : null}
    </div>
  );
}
