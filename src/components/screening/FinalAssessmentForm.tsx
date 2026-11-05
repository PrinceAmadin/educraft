"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuCircleCheck, LuClock, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { FINAL_TEXT } from "@/lib/screening/final-practical";
import { cn } from "@/lib/utils";

interface View {
  status: "SENT" | "IN_PROGRESS" | "SUBMITTED";
  minutes: number;
  deadlineAt: string | Date | null;
  briefs: { writing1: string; writing2: string; memo: string; prompt: string };
  uploaded: { chapter1: boolean; chapter2: boolean };
}

/**
 * The candidate's final assessment: two writing samples to upload and two
 * written answers. The clock starts server-side; scoring (the voice scan) and
 * the decision are entirely server/COO side.
 */
export function FinalAssessmentForm({ token, view }: { token: string; view: View }) {
  const router = useRouter();

  if (view.status === "SUBMITTED") {
    return (
      <section className="rounded-xl bg-zone p-6 text-center">
        <LuCircleCheck className="mx-auto size-8 text-primary" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold text-foreground">{FINAL_TEXT.doneTitle}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{FINAL_TEXT.doneBody}</p>
      </section>
    );
  }
  if (view.status === "SENT") return <Intro token={token} minutes={view.minutes} onStarted={() => router.refresh()} />;
  return <InProgress token={token} view={view} onSubmitted={() => router.refresh()} />;
}

function Intro({ token, minutes, onStarted }: { token: string; minutes: number; onStarted: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const start = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/final/${token}/start`, { method: "POST" });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        setProblem(b?.error ?? FINAL_TEXT.submitError);
        return;
      }
      onStarted();
    } catch {
      setProblem(FINAL_TEXT.submitError);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground">{FINAL_TEXT.introTitle}</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">{FINAL_TEXT.introBody}</p>
      <div className="flex items-start gap-2 rounded-xl bg-zone p-4 text-sm text-foreground">
        <LuClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        {FINAL_TEXT.timeNote(minutes)}
      </div>
      {problem ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {problem}
        </p>
      ) : null}
      <Button type="button" onClick={() => void start()} disabled={busy}>
        {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
        {FINAL_TEXT.startLabel}
      </Button>
    </section>
  );
}

function Brief({ text }: { text: string }) {
  return <p className="whitespace-pre-wrap rounded-xl bg-zone p-4 text-sm leading-relaxed text-foreground">{text}</p>;
}

function UploadPart({ token, slot, title, brief, initial }: { token: string; slot: 1 | 2; title: string; brief: string; initial: boolean }) {
  const [uploaded, setUploaded] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const upload = async (file: File) => {
    setBusy(true);
    setProblem(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("slot", String(slot));
      const res = await fetch(`/api/final/${token}/upload`, { method: "POST", body });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        setProblem(b?.error ?? FINAL_TEXT.writingUploadError);
        return;
      }
      setUploaded(true);
    } catch {
      setProblem(FINAL_TEXT.writingUploadError);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3" data-uploaded={uploaded}>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <Brief text={brief} />
      <div className="rounded-xl bg-zone p-4">
        <p className="meta-label">{FINAL_TEXT.writingUploadLabel}</p>
        <input
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
          className="mt-2 block w-full text-sm text-foreground file:mr-3 file:min-h-[40px] file:cursor-pointer file:rounded-lg file:border-0 file:bg-card file:px-4 file:text-sm file:font-medium file:text-foreground file:shadow-soft"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">{FINAL_TEXT.writingUploadHint}</p>
        {busy ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> {FINAL_TEXT.submitting}
          </p>
        ) : uploaded ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-primary">
            <LuCircleCheck className="size-4" aria-hidden /> {FINAL_TEXT.writingUploaded}
          </p>
        ) : null}
        {problem ? (
          <p role="alert" className="mt-2 flex items-start gap-2 text-sm text-danger">
            <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {problem}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function InProgress({ token, view, onSubmitted }: { token: string; view: View; onSubmitted: () => void }) {
  const [memo, setMemo] = React.useState("");
  const [prompt, setPrompt] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [remaining, setRemaining] = React.useState<number | null>(null);
  const submittedRef = React.useRef(false);

  // The two uploads post straight away; read their state from the DOM markers so
  // the parts stay independent components.
  const bothUploaded = () => {
    if (typeof document === "undefined") return false;
    return [...document.querySelectorAll("[data-uploaded]")].every((n) => n.getAttribute("data-uploaded") === "true");
  };

  const submit = React.useCallback(
    async (auto: boolean) => {
      if (submittedRef.current) return;
      if (!auto && (!bothUploaded() || !memo.trim() || !prompt.trim())) {
        setProblem(FINAL_TEXT.answerAll);
        return;
      }
      submittedRef.current = true;
      setBusy(true);
      setProblem(null);
      try {
        const res = await fetch(`/api/final/${token}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memoResponse: memo, promptResponse: prompt }),
        });
        if (!res.ok) {
          submittedRef.current = false;
          const b = (await res.json().catch(() => null)) as { error?: string } | null;
          setProblem(b?.error ?? FINAL_TEXT.submitError);
          return;
        }
        onSubmitted();
      } catch {
        submittedRef.current = false;
        setProblem(FINAL_TEXT.submitError);
      } finally {
        setBusy(false);
      }
    },
    [token, memo, prompt, onSubmitted]
  );

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
        <div className={cn("sticky top-2 z-10 flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-sm shadow-soft", remaining < 300 ? "text-danger" : "text-foreground")}>
          <LuClock className="size-4 shrink-0" aria-hidden />
          <span className="font-mono tabular-nums">
            {mm}:{String(ss).padStart(2, "0")}
          </span>
          <span className="text-muted-foreground">left</span>
        </div>
      ) : null}

      <UploadPart token={token} slot={1} title={FINAL_TEXT.writing1Title} brief={view.briefs.writing1} initial={view.uploaded.chapter1} />
      <UploadPart token={token} slot={2} title={FINAL_TEXT.writing2Title} brief={view.briefs.writing2} initial={view.uploaded.chapter2} />

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">{FINAL_TEXT.memoTitle}</h2>
        <Brief text={view.briefs.memo} />
        <label className="block">
          <span className="meta-label">{FINAL_TEXT.memoAnswerLabel}</span>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={6}
            maxLength={10000}
            placeholder={FINAL_TEXT.responsePlaceholder}
            className="mt-1 w-full rounded-lg bg-card p-3 text-sm leading-relaxed text-foreground shadow-soft outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">{FINAL_TEXT.promptTitle}</h2>
        <Brief text={view.briefs.prompt} />
        <label className="block">
          <span className="meta-label">{FINAL_TEXT.promptAnswerLabel}</span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={6}
            maxLength={10000}
            placeholder={FINAL_TEXT.responsePlaceholder}
            className="mt-1 w-full rounded-lg bg-card p-3 text-sm leading-relaxed text-foreground shadow-soft outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </section>

      {problem ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {problem}
        </p>
      ) : null}

      <div className="pb-10">
        <Button type="button" onClick={() => void submit(false)} disabled={busy}>
          {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          {busy ? FINAL_TEXT.submitting : FINAL_TEXT.submitLabel}
        </Button>
      </div>
    </div>
  );
}
