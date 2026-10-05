"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleCheck, LuCirclePause, LuFileText, LuLoaderCircle, LuRefreshCw, LuSend, LuX } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { COUNT_VALUE_TEXT } from "@/lib/generation/count-placeholders";
import { DataFilesPicker } from "@/components/files/DataFilesPicker";
import { DataFormFields } from "@/components/forms/DataFormFields";
import { useConfirm } from "@/components/ui/confirm";
import type { UploadedRef } from "@/lib/files/upload-client";
import { humanSize } from "@/lib/files/upload-client";
import type { PauseReviewView } from "@/lib/services/data-pause";
import { cn, formatDateTime } from "@/lib/utils";

/**
 * D4: the specialist's side of a data pause. The client sends the files; the
 * specialist (the assigned worker, or the founder/COO from the Report tab)
 * checks them, may add their own (e.g. the analysis they ran on the raw data),
 * corrects the answers, ticks which PDFs and images the chapters read, then
 * marks it all verified (the client's date moves on) or asks for more.
 */
export function DataPauseReviewCard({
  initial,
  actionEndpoint,
  uploadEndpoint,
  isAdmin = false,
}: {
  initial: PauseReviewView;
  /** /api/worker/projects/{code}/data-pause or /api/admin/projects/{code}/data-pause */
  actionEndpoint: string;
  /** The same caller's upload route (tickets for the private store). */
  uploadEndpoint: string;
  /** Founder/COO: may also redraft the request and cancel the pause. */
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [view, setView] = React.useState(initial);
  const [answers, setAnswers] = React.useState<Record<string, string>>(initial.answers ?? {});
  const [ticked, setTicked] = React.useState<Set<string>>(() => defaultTicks(initial));
  const [ownFiles, setOwnFiles] = React.useState<UploadedRef[]>([]);
  const [pickerKey, setPickerKey] = React.useState(0);
  const [uploading, setUploading] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [problems, setProblems] = React.useState<string[]>([]);
  const [asking, setAsking] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [values, setValues] = React.useState<Record<string, string>>(() => prefilled(initial));

  const active = view.status === "OPEN" || view.status === "SUBMITTED";
  const submitted = view.status === "SUBMITTED";
  const slots = view.valueSlots ?? [];
  const valuesMissing = slots.filter((s) => !values[s.key]?.trim()).length;

  async function act(body: Record<string, unknown>, label: string) {
    setBusy(label);
    setProblems([]);
    try {
      const res = await fetch(actionEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setProblems(Array.isArray(data?.problems) && data.problems.length ? data.problems : [data?.error ?? "That didn't work. Try again."]);
        return false;
      }
      const next: PauseReviewView | null = data?.pause ?? (data?.pauses as PauseReviewView[] | undefined)?.find((p) => p.id === view.id) ?? null;
      if (next) {
        setView(next);
        setAnswers(next.answers ?? {});
        // Keep what the specialist typed; slots the view now pre-fills (e.g. after saving answers) fill the gaps.
        setValues((v) => ({ ...prefilled(next), ...Object.fromEntries(Object.entries(v).filter(([, x]) => x.trim())) }));
        setTicked((t) => new Set([...t].filter((id) => next.files.some((f) => f.id === id)).concat(newTicks(view, next))));
      }
      router.refresh();
      return true;
    } catch {
      setProblems(["Could not reach EduCraft. Check your connection and try again."]);
      return false;
    } finally {
      setBusy(null);
    }
  }

  const statusLine = view.preparing
    ? view.formError
      ? `The request could not be drafted: ${view.formError}`
      : "The data request is being prepared."
    : view.status === "OPEN"
      ? view.round > 1
        ? `Asked the client for more (request ${view.round}). Waiting for their files; their delivery date stays paused.`
        : "Waiting for the client's files. Their delivery date is paused until you verify the data."
      : view.status === "SUBMITTED"
        ? `The client sent their files${view.submittedAt ? ` on ${formatDateTime(view.submittedAt)}` : ""}. Check them, then mark them verified or ask for more.`
        : view.status === "RESUMED"
          ? `Verified${view.resumedAt ? ` on ${formatDateTime(view.resumedAt)}` : ""}. The client's delivery date moved on by ${view.pausedDays ?? 0} day${view.pausedDays === 1 ? "" : "s"}.`
          : "Cancelled.";

  return (
    <section className={cn("space-y-6 rounded-2xl p-4 sm:p-6", submitted ? "bg-gold/10" : "bg-zone")} aria-labelledby={`pause-${view.id}`}>
      <div className="space-y-2">
        <p className="eyebrow flex items-center gap-2 text-gold">
          <LuCirclePause className="size-4" aria-hidden />
          Report paused after Chapter {view.afterChapter}: client data
        </p>
        {view.title ? (
          <h2 id={`pause-${view.id}`} className="text-lg font-semibold tracking-tight text-foreground">
            {view.title}
          </h2>
        ) : (
          <h2 id={`pause-${view.id}`} className="sr-only">
            Data pause
          </h2>
        )}
        <p className={cn("flex items-start gap-2 text-sm", view.formError ? "text-danger" : "text-foreground")}>
          {view.preparing && !view.formError ? <LuLoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin text-primary" aria-hidden /> : null}
          {statusLine}
        </p>
        {isAdmin && view.preparing && view.formError ? (
          <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => void act({ action: "regenerate_form", pauseId: view.id }, "redraft")}>
            <LuRefreshCw aria-hidden />
            {busy === "redraft" ? "Drafting…" : "Draft the request again"}
          </Button>
        ) : null}
      </div>

      {view.description ? (
        <div className="space-y-3">
          <p className="meta-label">What the client was asked</p>
          <p className="max-w-3xl text-sm leading-relaxed text-foreground">{view.description}</p>
          {view.dataFrom ? (
            <p className="text-xs text-muted-foreground">
              {view.dataFrom === "RAW" ? "This order includes our data analysis: the client sends raw data and you run the analysis." : "The client sends their own analysis."}
            </p>
          ) : null}
          {view.workerNote && view.status === "OPEN" ? (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Your note to the client:</span> {view.workerNote}
            </p>
          ) : null}
          {view.checklist.length ? (
            <ul className="space-y-1">
              {view.checklist.map((c) => (
                <li key={c} className="flex items-start gap-2 text-sm text-foreground">
                  <LuCircleCheck className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
                  {c}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {view.files.length ? (
        <div className="space-y-2">
          <p className="meta-label">Client data files</p>
          <ul className="divide-y divide-border/80">
            {view.files.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <LuFileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <a href={f.href} className="min-w-0 max-w-full flex-1 truncate text-sm font-medium text-primary hover:underline">
                  {f.name}
                </a>
                <span className="text-xs text-muted-foreground">
                  {f.from === "CLIENT" ? "Client" : "Specialist"}
                  {f.size ? ` · ${humanSize(f.size)}` : ""}
                </span>
                {f.kind === "text" ? (
                  <span className="w-full pl-7 text-xs text-muted-foreground sm:w-auto sm:pl-0">Read into the chapters as text</span>
                ) : (
                  <label className={cn("flex min-h-10 w-full items-center gap-2 pl-7 text-xs text-foreground sm:w-auto sm:pl-0", !submitted && "opacity-60")}>
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={view.status === "RESUMED" ? view.chapterFileIds.includes(f.id) : ticked.has(f.id)}
                      disabled={!submitted || busy !== null}
                      onChange={(e) =>
                        setTicked((t) => {
                          const next = new Set(t);
                          if (e.target.checked) next.add(f.id);
                          else next.delete(f.id);
                          return next;
                        })
                      }
                    />
                    Use in the chapters
                  </label>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {view.fields.length && (submitted || Object.keys(view.answers).length) ? (
        <div className="space-y-3">
          <p className="meta-label">The client&apos;s answers{submitted ? " (correct them if needed)" : ""}</p>
          <DataFormFields fields={view.fields} values={answers} onChange={(k, v) => setAnswers((a) => ({ ...a, [k]: v }))} disabled={!submitted || busy !== null} idPrefix={`review-${view.id}`} />
          {submitted ? (
            <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => void act({ action: "save_answers", pauseId: view.id, answers }, "answers")}>
              {busy === "answers" ? "Saving…" : "Save answers"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {submitted && slots.length ? (
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="meta-label">{COUNT_VALUE_TEXT.heading(slots.flatMap((s) => s.chapters))}</p>
            <p className="max-w-3xl text-sm text-muted-foreground">{COUNT_VALUE_TEXT.explain([...new Set(slots.flatMap((s) => s.chapters))])}</p>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {slots.map((s) => (
              <div key={s.key} className="space-y-1.5">
                <label htmlFor={`value-${view.id}-${s.key}`} className="block text-sm font-medium text-foreground">
                  {s.label}
                  {s.occurrences > 1 ? <span className="font-normal text-muted-foreground"> · {s.occurrences} places</span> : null}
                </label>
                {s.table ? <p className="text-xs text-muted-foreground">{COUNT_VALUE_TEXT.tableRow(s.table.row)}</p> : null}
                <Input
                  id={`value-${view.id}-${s.key}`}
                  value={values[s.key] ?? ""}
                  maxLength={200}
                  disabled={busy !== null}
                  onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))}
                />
                <p className="text-xs leading-relaxed text-muted-foreground">{s.context}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {active && !view.preparing ? (
        <div className="space-y-3">
          <p className="meta-label">Add your own files (for example the analysis you ran)</p>
          <DataFilesPicker key={pickerKey} id={`own-files-${view.id}`} endpoint={uploadEndpoint} targetId={view.id} onChange={setOwnFiles} onBusyChange={setUploading} disabled={busy !== null} label="Choose files" />
          {ownFiles.length ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy !== null || uploading}
              onClick={async () => {
                const ok = await act({ action: "add_files", pauseId: view.id, files: ownFiles.map((f) => ({ pathname: f.pathname, ticket: f.ticket, fileName: f.fileName })) }, "files");
                if (ok) {
                  setOwnFiles([]);
                  setPickerKey((k) => k + 1);
                }
              }}
            >
              {busy === "files" ? "Adding…" : `Add ${ownFiles.length === 1 ? "this file" : `these ${ownFiles.length} files`}`}
            </Button>
          ) : null}
        </div>
      ) : null}

      {problems.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-danger" role="alert">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}

      {submitted ? (
        asking ? (
          <div className="space-y-3">
            <label htmlFor={`more-${view.id}`} className="meta-label block">
              What else should the client send? (optional; they see this note)
            </label>
            <Textarea id={`more-${view.id}`} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} disabled={busy !== null} />
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                disabled={busy !== null}
                onClick={async () => {
                  if (await act({ action: "request_more", pauseId: view.id, note }, "more")) {
                    setAsking(false);
                    setNote("");
                  }
                }}
              >
                <LuSend aria-hidden />
                {busy === "more" ? "Sending…" : "Send to the client"}
              </Button>
              <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => setAsking(false)}>
                Back
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              disabled={busy !== null || uploading || valuesMissing > 0}
              onClick={() => void act({ action: "verify", pauseId: view.id, chapterFileIds: [...ticked], values: Object.fromEntries(slots.map((s) => [s.key, (values[s.key] ?? "").trim()])) }, "verify")}
            >
              <LuCircleCheck aria-hidden />
              {busy === "verify" ? "Verifying…" : "Mark as verified"}
            </Button>
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => setAsking(true)}>
              Request more files
            </Button>
            {valuesMissing > 0 ? (
              <p className="w-full text-xs text-muted-foreground">
                {valuesMissing === 1 ? "One value above is" : `${valuesMissing} values above are`} still empty.
              </p>
            ) : null}
          </div>
        )
      ) : null}

      {isAdmin && active ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy !== null}
            onClick={async () => {
              if (
                await confirm({
                  title: "Cancel this data request?",
                  description: "The report stops waiting for it and nothing from it reaches the chapters.",
                  confirmLabel: "Cancel request",
                  cancelLabel: "Keep waiting",
                  tone: "danger",
                })
              ) {
                void act({ action: "cancel", pauseId: view.id }, "cancel");
              }
            }}
          >
            <LuX aria-hidden />
            {busy === "cancel" ? "Cancelling…" : "Cancel this request"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function prefilled(v: PauseReviewView): Record<string, string> {
  return Object.fromEntries((v.valueSlots ?? []).map((s) => [s.key, s.prefill]));
}

/** Every PDF and image starts ticked; verifying says which to leave out if they don't fit. */
function defaultTicks(v: PauseReviewView): Set<string> {
  return new Set(v.files.filter((f) => f.kind !== "text").map((f) => f.id));
}

/** Files that arrived since the last view start ticked too. */
function newTicks(before: PauseReviewView, after: PauseReviewView): string[] {
  const seen = new Set(before.files.map((f) => f.id));
  return after.files.filter((f) => f.kind !== "text" && !seen.has(f.id)).map((f) => f.id);
}
