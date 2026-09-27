"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleCheck, LuCirclePause, LuFileText, LuLoaderCircle, LuSend } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/Field";
import { PrivateFilePicker } from "@/components/files/PrivateFilePicker";
import type { UploadedRef } from "@/lib/files/upload-client";
import type { DataFormField, DataFormFile } from "@/lib/generation/dynamic-data-form";
import type { WorkerPauseView } from "@/lib/services/data-pause";
import { formatDateTime } from "@/lib/utils";

const FORMAT_LABEL: Record<string, string> = { pdf: "PDF", docx: "Word", xlsx: "Excel", csv: "CSV", png: "PNG", jpg: "JPG" };

function acceptFor(formats: string[]): string {
  return formats.flatMap((f) => (f === "jpg" ? [".jpg", ".jpeg"] : [`.${f}`])).join(",");
}

function formatsLabel(formats: string[]): string {
  const names = formats.map((f) => FORMAT_LABEL[f] ?? f.toUpperCase());
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}` : names[0];
}

function FieldInput({ field, value, onChange, disabled }: { field: DataFormField; value: string; onChange: (v: string) => void; disabled: boolean }) {
  const id = `pause-field-${field.key}`;
  if (field.type === "textarea") return <Textarea id={id} rows={3} value={value} maxLength={2000} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
  if (field.type === "select")
    return (
      <Select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose…</option>
        {field.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    );
  return (
    <Input
      id={id}
      type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
      inputMode={field.type === "number" ? "decimal" : undefined}
      step={field.type === "number" ? "any" : undefined}
      value={value}
      maxLength={300}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/**
 * D3c: the report is paused for this project's data. The banner shows the
 * request EduCraft drafted for THIS project (not a generic upload button):
 * what to upload and what it must show, one slot per file, and the few facts
 * the chapters need. It sits above the tabs until the COO resumes the report.
 */
export function DataPauseBanner({ projectCode, initial }: { projectCode: string; initial: WorkerPauseView }) {
  const router = useRouter();
  const [view, setView] = React.useState(initial);
  const [editing, setEditing] = React.useState(initial.status === "OPEN");
  const [answers, setAnswers] = React.useState<Record<string, string>>(initial.answers ?? {});
  const [uploads, setUploads] = React.useState<Record<string, UploadedRef | null>>({});
  const [keep, setKeep] = React.useState<Record<string, string>>(() => Object.fromEntries(initial.sent.map((f) => [f.slot, f.id])));
  const [uploading, setUploading] = React.useState(0);
  const [sending, setSending] = React.useState(false);
  const [problems, setProblems] = React.useState<string[]>([]);

  // While EduCraft prepares the request, check back every 5 seconds.
  React.useEffect(() => {
    if (!view.preparing) return;
    const id = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/worker/projects/${projectCode}/data-pause`, { cache: "no-store" });
        const data = (await res.json()) as { pause: WorkerPauseView | null };
        if (data.pause) setView(data.pause);
      } catch {
        // offline for a moment: the next check tries again
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [view.preparing, projectCode]);

  const afterWhat = `after Chapter ${view.afterChapter}`;

  if (view.preparing) {
    return (
      <section className="flex items-start gap-3 rounded-2xl bg-zone p-4" role="status" aria-live="polite">
        <LuLoaderCircle className="mt-0.5 size-5 shrink-0 animate-spin text-primary" aria-hidden />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">The report is paused {afterWhat}.</p>
          <p className="text-sm text-muted-foreground">EduCraft is preparing exactly what to upload for this project. This page updates by itself.</p>
        </div>
      </section>
    );
  }

  if (!editing && view.status === "SUBMITTED") {
    return (
      <section className="space-y-3 rounded-2xl bg-success/10 p-4" aria-labelledby="pause-sent">
        <p id="pause-sent" className="flex items-start gap-2 text-sm font-semibold text-foreground">
          <LuCircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <span>
            Data sent{view.submittedAt ? ` on ${formatDateTime(view.submittedAt)}` : ""}. The report resumes once the COO has checked it.
          </span>
        </p>
        <ul className="space-y-2.5">
          {view.sent.map((f) => (
            <li key={f.id} className="flex items-start gap-2 text-sm">
              <LuFileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <a href={f.href} className="block truncate font-medium text-primary hover:underline">
                  {f.name}
                </a>
                <p className="text-xs text-muted-foreground">{view.files.find((s) => s.key === f.slot)?.label ?? f.slot}</p>
              </div>
            </li>
          ))}
        </ul>
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
          Change what I sent
        </Button>
      </section>
    );
  }

  const slotReady = (s: DataFormFile) => Boolean(uploads[s.key] || keep[s.key]);
  const missing = [
    ...view.files.filter((s) => s.required && !slotReady(s)).map((s) => `Upload "${s.label}".`),
    ...view.fields.filter((f) => f.required && !(answers[f.key] ?? "").trim()).map((f) => `Fill in "${f.label}".`),
  ];

  async function send() {
    setSending(true);
    setProblems([]);
    try {
      type SlotFile = { slot: string; upload?: { pathname: string; ticket: string; fileName: string }; keepFileId?: string };
      const files = view.files.flatMap((s): SlotFile[] => {
        const up = uploads[s.key];
        if (up) return [{ slot: s.key, upload: { pathname: up.pathname, ticket: up.ticket, fileName: up.fileName } }];
        if (keep[s.key]) return [{ slot: s.key, keepFileId: keep[s.key] }];
        return [];
      });
      const res = await fetch(`/api/worker/projects/${projectCode}/data-pause/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pauseId: view.id, answers, files }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setProblems(Array.isArray(data?.problems) && data.problems.length ? data.problems : [data?.error ?? "That did not send. Try again."]);
        return;
      }
      const next = data.pause as WorkerPauseView;
      setView(next);
      setUploads({});
      setKeep(Object.fromEntries(next.sent.map((f) => [f.slot, f.id])));
      setEditing(false);
      router.refresh();
    } catch {
      setProblems(["Could not reach EduCraft. Check your connection and try again."]);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="space-y-6 rounded-2xl bg-gold/10 p-4 sm:p-6" aria-labelledby="pause-title">
      <div className="space-y-2">
        <p className="eyebrow flex items-center gap-2 text-gold">
          <LuCirclePause className="size-4" aria-hidden />
          Report paused {afterWhat}: your data is needed
        </p>
        <h2 id="pause-title" className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
          {view.title}
        </h2>
        <p className="max-w-3xl text-base leading-relaxed text-foreground">{view.description}</p>
      </div>

      {view.checklist.length ? (
        <div className="space-y-2">
          <p className="meta-label">Your upload should show</p>
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

      <div className="space-y-5">
        {view.files.map((s) => {
          const kept = keep[s.key] ? view.sent.find((f) => f.id === keep[s.key]) : null;
          return (
            <div key={s.key} className="space-y-2">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {s.label} <span className="font-normal text-muted-foreground">{s.required ? "(required)" : "(optional)"}</span>
                </p>
                {s.description ? <p className="max-w-3xl text-sm text-muted-foreground">{s.description}</p> : null}
              </div>
              {kept && !uploads[s.key] ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <LuFileText className="size-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 truncate font-medium text-foreground">{kept.name}</span>
                  <span className="text-xs text-muted-foreground">already sent</span>
                  <button
                    type="button"
                    className="min-h-11 px-1 text-sm font-medium text-primary hover:underline"
                    onClick={() => setKeep((k) => Object.fromEntries(Object.entries(k).filter(([slot]) => slot !== s.key)))}
                  >
                    Replace
                  </button>
                </div>
              ) : (
                <PrivateFilePicker
                  id={`pause-file-${s.key}`}
                  endpoint={`/api/worker/projects/${projectCode}/upload`}
                  purpose="data"
                  targetId={view.id}
                  value={uploads[s.key] ?? null}
                  onChange={(ref) => setUploads((u) => ({ ...u, [s.key]: ref }))}
                  onBusyChange={(b) => setUploading((n) => Math.max(0, n + (b ? 1 : -1)))}
                  label={`Choose the ${formatsLabel(s.formats)} file`}
                  accept={acceptFor(s.formats)}
                  hint={`${formatsLabel(s.formats)}, up to 20 MB${s.formats.some((f) => f === "png" || f === "jpg") ? " (screenshots up to 5 MB)" : ""}`}
                />
              )}
            </div>
          );
        })}
      </div>

      {view.fields.length ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {view.fields.map((f) => (
            <Field key={f.key} label={f.label} htmlFor={`pause-field-${f.key}`} required={f.required} hint={f.help ?? undefined} className={f.type === "textarea" ? "sm:col-span-2" : undefined}>
              <FieldInput field={f} value={answers[f.key] ?? ""} disabled={sending} onChange={(v) => setAnswers((a) => ({ ...a, [f.key]: v }))} />
            </Field>
          ))}
        </div>
      ) : null}

      {problems.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-danger" role="alert">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void send()} disabled={sending || uploading > 0 || missing.length > 0}>
          <LuSend aria-hidden />
          {sending ? "Sending…" : "Send to EduCraft"}
        </Button>
        {view.status === "SUBMITTED" ? (
          <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={sending}>
            Keep what I sent
          </Button>
        ) : null}
        {missing.length && !sending ? <p className="text-xs text-muted-foreground">{missing[0]}</p> : null}
      </div>
    </section>
  );
}
