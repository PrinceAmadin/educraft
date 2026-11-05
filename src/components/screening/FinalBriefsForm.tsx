"use client";

import * as React from "react";
import { LuCircleAlert, LuCircleCheck, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/Field";

interface Settings {
  minutes: number;
  writingBrief1: string;
  writingBrief2: string;
  memoBrief: string;
  promptBrief: string;
}

/** The founder's final-practical briefs and clock, editable. Defaults apply until changed. */
export function FinalBriefsForm({ settings }: { settings: Settings }) {
  const [minutes, setMinutes] = React.useState(String(settings.minutes));
  const [w1, setW1] = React.useState(settings.writingBrief1);
  const [w2, setW2] = React.useState(settings.writingBrief2);
  const [memo, setMemo] = React.useState(settings.memoBrief);
  const [prompt, setPrompt] = React.useState(settings.promptBrief);
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setProblem(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/settings/final", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes: Number(minutes), writingBrief1: w1, writingBrief2: w2, memoBrief: memo, promptBrief: prompt }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        setProblem(b?.error ?? "That did not save.");
        return;
      }
      setSaved(true);
    } catch {
      setProblem("That did not save. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Final practical</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The Stage-3 assessment the COO sends after a candidate passes screening: two writing samples (voice-scanned for you) and two written tasks you read. These briefs are what the candidate sees.
        </p>
      </div>
      <div className="max-w-[12rem]">
        <Field label="Minutes" htmlFor="f-minutes">
          <Input id="f-minutes" type="number" min={10} max={480} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </Field>
      </div>
      <Field label="Part 1 — writing brief (introduction)" htmlFor="f-w1">
        <Textarea id="f-w1" rows={3} maxLength={4000} value={w1} onChange={(e) => setW1(e.target.value)} />
      </Field>
      <Field label="Part 2 — writing brief (literature review)" htmlFor="f-w2">
        <Textarea id="f-w2" rows={3} maxLength={4000} value={w2} onChange={(e) => setW2(e.target.value)} />
      </Field>
      <Field label="Part 3 — reply-to-supervisor task" htmlFor="f-memo">
        <Textarea id="f-memo" rows={5} maxLength={4000} value={memo} onChange={(e) => setMemo(e.target.value)} />
      </Field>
      <Field label="Part 4 — working-without-tools task" htmlFor="f-prompt">
        <Textarea id="f-prompt" rows={4} maxLength={4000} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </Field>
      {problem ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {problem}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void save()}>
          {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          Save final-practical briefs
        </Button>
        {saved ? (
          <span className="flex items-center gap-1 text-xs text-success">
            <LuCircleCheck className="size-4" aria-hidden /> Saved
          </span>
        ) : null}
      </div>
    </section>
  );
}
