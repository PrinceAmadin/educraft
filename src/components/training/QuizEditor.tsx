"use client";

import * as React from "react";
import {
  LuCircleAlert,
  LuCircleCheck,
  LuLoaderCircle,
  LuPencil,
  LuPlus,
  LuTrash2,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm";
import { Field } from "@/components/forms/Field";
import { DEFAULT_QUIZ_PASS_PERCENT } from "@/lib/training/rules";
import { cn } from "@/lib/utils";

/**
 * The founder's quiz editor for one worker training episode: the pass mark and
 * the questions (prompt, 2–6 answers with the correct one marked, an optional
 * explanation). Only the founder opens this; every route it calls re-checks
 * `requireSuperAdmin`. An episode with ≥1 active question holds the gate until
 * the worker passes.
 */

interface QuestionAdmin {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string | null;
  isActive: boolean;
  sortOrder: number;
}

export function QuizEditor({
  episode,
  onClose,
  onChanged,
}: {
  episode: { id: string; episodeNo: number; title: string; quizPassPercent: number | null };
  onClose: () => void;
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const [questions, setQuestions] = React.useState<QuestionAdmin[] | null>(null);
  const [passPercent, setPassPercent] = React.useState(String(episode.quizPassPercent ?? DEFAULT_QUIZ_PASS_PERCENT));
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<QuestionAdmin | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setProblem(null);
    try {
      const res = await fetch(`/api/admin/tutorials/${episode.id}/quiz`, { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { questions?: QuestionAdmin[] } | null;
      if (!res.ok || !body?.questions) {
        setProblem("Could not load the questions.");
        return;
      }
      setQuestions(body.questions);
    } catch {
      setProblem("Could not load the questions.");
    }
  }, [episode.id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const savePassPercent = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/admin/tutorials/${episode.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizPassPercent: Number(passPercent) }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setProblem(body?.error ?? "That did not save.");
        return;
      }
      onChanged();
    } catch {
      setProblem("That did not save. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (q: QuestionAdmin) => {
    setBusy(true);
    try {
      await fetch(`/api/admin/tutorials/${episode.id}/quiz/${q.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !q.isActive }),
      });
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (q: QuestionAdmin) => {
    const ok = await confirm({
      title: "Delete this question?",
      description: "It is removed from the episode's quiz. Attempts already taken are kept.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/tutorials/${episode.id}/quiz/${q.id}`, { method: "DELETE" });
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const activeCount = questions?.filter((q) => q.isActive).length ?? 0;

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Quiz — Episode {episode.episodeNo}, {episode.title}
          </DialogTitle>
          <DialogDescription>
            An episode with an active question holds the gate until the worker passes it. Workers see the questions and
            answers in a random order.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Pass mark (%)" htmlFor="pass-percent" className="w-28">
              <Input
                id="pass-percent"
                type="number"
                min={1}
                max={100}
                value={passPercent}
                onChange={(e) => setPassPercent(e.target.value)}
              />
            </Field>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void savePassPercent()}>
              Save pass mark
            </Button>
            <p className="text-xs text-muted-foreground">
              {activeCount} active question{activeCount === 1 ? "" : "s"}
            </p>
          </div>

          {problem ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-danger">
              <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {problem}
            </p>
          ) : null}

          {questions == null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Loading…
            </p>
          ) : questions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No questions yet — add the first one.</p>
          ) : (
            <ul className="divide-y divide-border/70">
              {questions.map((q, i) => (
                <li key={q.id} className="py-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-medium", q.isActive ? "text-foreground" : "text-muted-foreground line-through")}>
                        {i + 1}. {q.prompt}
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {q.options.map((o, idx) => (
                          <li
                            key={idx}
                            className={cn(
                              "flex items-center gap-1.5 text-xs",
                              idx === q.correctIndex ? "text-success" : "text-muted-foreground"
                            )}
                          >
                            {idx === q.correctIndex ? <LuCircleCheck className="size-3 shrink-0" aria-hidden /> : <span className="w-3" />}
                            {o}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button type="button" variant="ghost" size="icon" aria-label="Edit" onClick={() => setEditing(q)}>
                        <LuPencil className="size-4" aria-hidden />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" aria-label="Delete" disabled={busy} onClick={() => void remove(q)}>
                        <LuTrash2 className="size-4 text-danger" aria-hidden />
                      </Button>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleActive(q)}
                    className="mt-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
                  >
                    {q.isActive ? "Deactivate (keep but don't ask)" : "Activate"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
            <LuPlus className="size-4" aria-hidden /> Add question
          </Button>
        </div>

        {adding ? (
          <QuestionForm
            episodeId={episode.id}
            onClose={() => setAdding(false)}
            onSaved={async () => {
              setAdding(false);
              await load();
              onChanged();
            }}
          />
        ) : null}
        {editing ? (
          <QuestionForm
            episodeId={episode.id}
            question={editing}
            onClose={() => setEditing(null)}
            onSaved={async () => {
              setEditing(null);
              await load();
              onChanged();
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function QuestionForm({
  episodeId,
  question,
  onClose,
  onSaved,
}: {
  episodeId: string;
  question?: QuestionAdmin;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [prompt, setPrompt] = React.useState(question?.prompt ?? "");
  const [options, setOptions] = React.useState<string[]>(question?.options ?? ["", ""]);
  const [correctIndex, setCorrectIndex] = React.useState(question?.correctIndex ?? 0);
  const [explanation, setExplanation] = React.useState(question?.explanation ?? "");
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  const setOption = (i: number, v: string) => setOptions((o) => o.map((x, idx) => (idx === i ? v : x)));
  const addOption = () => setOptions((o) => (o.length < 6 ? [...o, ""] : o));
  const removeOption = (i: number) =>
    setOptions((o) => {
      if (o.length <= 2) return o;
      const next = o.filter((_, idx) => idx !== i);
      if (correctIndex >= next.length) setCorrectIndex(next.length - 1);
      else if (i < correctIndex) setCorrectIndex((c) => c - 1);
      return next;
    });

  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const url = question
        ? `/api/admin/tutorials/${episodeId}/quiz/${question.id}`
        : `/api/admin/tutorials/${episodeId}/quiz`;
      const res = await fetch(url, {
        method: question ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, options, correctIndex, explanation: explanation || null }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setProblem(body?.error ?? "That did not save.");
        return;
      }
      onSaved();
    } catch {
      setProblem("That did not save. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const canSave = prompt.trim() !== "" && options.filter((o) => o.trim() !== "").length >= 2;

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{question ? "Edit question" : "Add question"}</DialogTitle>
          <DialogDescription>Mark the correct answer with its radio button. 2 to 6 answers.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Question" htmlFor="q-prompt" required>
            <Textarea id="q-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} maxLength={500} />
          </Field>
          <div className="space-y-2">
            <p className="meta-label">Answers</p>
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correct"
                  aria-label={`Answer ${i + 1} is correct`}
                  className="size-4 shrink-0 accent-primary"
                  checked={correctIndex === i}
                  onChange={() => setCorrectIndex(i)}
                />
                <Input value={o} onChange={(e) => setOption(i, e.target.value)} maxLength={300} placeholder={`Answer ${i + 1}`} />
                {options.length > 2 ? (
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove answer" onClick={() => removeOption(i)}>
                    <LuTrash2 className="size-4" aria-hidden />
                  </Button>
                ) : null}
              </div>
            ))}
            {options.length < 6 ? (
              <Button type="button" variant="outline" size="sm" onClick={addOption}>
                <LuPlus className="size-4" aria-hidden /> Add answer
              </Button>
            ) : null}
          </div>
          <Field label="Explanation" htmlFor="q-explanation" hint="Shown after they answer, right or wrong. Optional.">
            <Textarea
              id="q-explanation"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              rows={2}
              maxLength={1000}
            />
          </Field>
          {problem ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-danger">
              <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {problem}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" disabled={busy || !canSave} onClick={() => void save()}>
              {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
