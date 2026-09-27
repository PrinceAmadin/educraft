"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleCheck, LuFileText, LuMessageSquareText, LuSend } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { DataFilesPicker } from "@/components/files/DataFilesPicker";
import { DataFormFields, firstMissingField } from "@/components/forms/DataFormFields";
import type { UploadedRef } from "@/lib/files/upload-client";
import { humanSize } from "@/lib/files/upload-client";
import type { ClientPauseView } from "@/lib/services/client-data-pause";
import { cn, formatDateTime } from "@/lib/utils";

export const CLIENT_BANNER_TEXT = {
  heading: "We need your data files to continue",
  shouldShow: "Your files should show",
  whatToSend: "What to send",
  note: "Your specialist left a note:",
  alreadySent: "Already sent (you don't need to send these again)",
  submit: "Submit my files",
  sending: "Sending…",
  received: "Files received — your specialist will review them shortly.",
  sentOn: "Sent",
  addFirst: "Add your files first.",
  answer: (label: string) => `Answer "${label}".`,
  failed: "That didn't send. Try again.",
  offline: "We couldn't reach EduCraft. Check your connection and try again.",
} as const;

/**
 * D4: the client's banner at the top of the Progress tab while their report
 * waits for their data. The request is shown exactly as it was written for
 * this project; the client picks their files, answers the few questions and
 * sends them. Afterwards the banner says they arrived and stays until the
 * specialist has checked them. In the admin preview nothing can be sent.
 */
export function ClientDataPauseBanner({ projectCode, initial, preview = false }: { projectCode: string; initial: ClientPauseView; preview?: boolean }) {
  const router = useRouter();
  const [view, setView] = React.useState(initial);
  const [answers, setAnswers] = React.useState<Record<string, string>>(initial.answers ?? {});
  const [files, setFiles] = React.useState<UploadedRef[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [problems, setProblems] = React.useState<string[]>([]);
  const t = CLIENT_BANNER_TEXT;
  const api = `/api/client/projects/${encodeURIComponent(projectCode)}`;
  const sent = view.status === "SUBMITTED";

  const missingField = firstMissingField(view.fields, answers);
  const blocker = files.length === 0 ? t.addFirst : missingField ? t.answer(missingField.label) : null;

  async function submit() {
    setSending(true);
    setProblems([]);
    try {
      const res = await fetch(`${api}/data-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pauseId: view.id, answers, files: files.map((f) => ({ pathname: f.pathname, ticket: f.ticket, fileName: f.fileName })) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setProblems(Array.isArray(data?.problems) && data.problems.length ? data.problems : [data?.error ?? t.failed]);
        return;
      }
      const again = await fetch(`${api}/data-upload`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (again?.pause) setView(again.pause as ClientPauseView);
      setFiles([]);
      router.refresh();
    } catch {
      setProblems([t.offline]);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className={cn("space-y-6 rounded-2xl p-4 sm:p-6", sent ? "bg-zone" : "bg-gold/10")} aria-labelledby="data-pause-heading">
      <div className="space-y-2">
        <h2 id="data-pause-heading" className="text-lg font-semibold tracking-tight text-foreground">
          {t.heading}
        </h2>
        <p className="text-sm font-medium text-muted-foreground">{view.title}</p>
        <p className="text-base leading-relaxed text-foreground">{view.description}</p>
      </div>

      {sent ? (
        <div className="space-y-3">
          <p className="flex items-start gap-2 text-sm font-semibold text-foreground" role="status">
            <LuCircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            <span>{t.received}</span>
          </p>
          <ul className="space-y-1.5">
            {view.sent.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-sm text-foreground">
                <LuFileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 truncate">{f.name}</span>
                {f.size ? <span className="shrink-0 text-xs text-muted-foreground">{humanSize(f.size)}</span> : null}
              </li>
            ))}
          </ul>
          {view.submittedAt ? (
            <p className="text-xs text-muted-foreground">
              {t.sentOn} {formatDateTime(view.submittedAt)}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          {view.note ? (
            <div className="flex items-start gap-3 rounded-xl bg-card p-4 shadow-soft">
              <LuMessageSquareText className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <p className="text-sm text-foreground">
                <span className="font-semibold">{t.note}</span> {view.note}
              </p>
            </div>
          ) : null}

          {view.sent.length ? (
            <div className="space-y-2">
              <p className="meta-label">{t.alreadySent}</p>
              <ul className="space-y-1.5">
                {view.sent.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-sm text-foreground">
                    <LuFileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 truncate">{f.name}</span>
                    {f.size ? <span className="shrink-0 text-xs text-muted-foreground">{humanSize(f.size)}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {view.checklist.length ? (
            <div className="space-y-2">
              <p className="meta-label">{t.shouldShow}</p>
              <ul className="space-y-1.5">
                {view.checklist.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-sm text-foreground">
                    <LuCircleCheck className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {view.whatToSend.length ? (
            <div className="space-y-2">
              <p className="meta-label">{t.whatToSend}</p>
              <ul className="space-y-2">
                {view.whatToSend.map((w) => (
                  <li key={w.label} className="text-sm">
                    <span className="font-medium text-foreground">{w.label}</span>{" "}
                    <span className="text-muted-foreground">{w.required ? "(needed)" : "(if you have it)"}</span>
                    {w.description ? <span className="block text-muted-foreground">{w.description}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {preview ? null : (
            <>
              <DataFilesPicker id="data-files" endpoint={`${api}/upload`} targetId={view.id} onChange={setFiles} onBusyChange={setUploading} disabled={sending} label="Choose your files" />
              <DataFormFields fields={view.fields} values={answers} onChange={(k, v) => setAnswers((a) => ({ ...a, [k]: v }))} disabled={sending} idPrefix="data-answer" />
              {problems.length ? (
                <ul className="list-disc space-y-1 pl-5 text-sm text-danger" role="alert">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={() => void submit()} disabled={sending || uploading || Boolean(blocker)}>
                  <LuSend aria-hidden />
                  {sending ? t.sending : t.submit}
                </Button>
                {blocker && !sending && !uploading ? <p className="text-xs text-muted-foreground">{blocker}</p> : null}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
