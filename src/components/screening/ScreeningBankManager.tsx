"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuCircleCheck, LuLoaderCircle, LuPencil, LuPlus, LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm";
import { Field } from "@/components/forms/Field";
import { CheckboxRow } from "@/components/forms/CheckboxRow";
import {
  RELEVANCE_LABELS,
  RELEVANCE_LABEL_TEXT,
  RELEVANCE_SOURCE_COUNT,
  type RelevanceLabel,
} from "@/lib/screening/rules";
import { cn } from "@/lib/utils";

interface Settings {
  passPercent: number;
  borderlineMargin: number;
  minutes: number;
  eyeCount: number;
  rewriteClaude: boolean;
  formatCount: number;
}
interface Item {
  id: string;
  kind: string;
  payload: unknown;
  answerKey: unknown;
  isActive: boolean;
  notes: string | null;
}

export function ScreeningBankManager({ settings, items }: { settings: Settings; items: Item[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [tab, setTab] = React.useState<"EYE" | "REL" | "REWRITE">("EYE");
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [addingEye, setAddingEye] = React.useState(false);
  const [addingRel, setAddingRel] = React.useState(false);
  const [addingRewrite, setAddingRewrite] = React.useState(false);
  const [editing, setEditing] = React.useState<Item | null>(null);

  const eye = items.filter((i) => i.kind === "EYE");
  const rel = items.filter((i) => i.kind === "REL");
  const rewrite = items.filter((i) => i.kind === "REWRITE");
  const activeEye = eye.filter((i) => i.isActive).length;
  const activeRel = rel.filter((i) => i.isActive).length;
  const activeRewrite = rewrite.filter((i) => i.isActive).length;

  async function call(url: string, init: RequestInit): Promise<boolean> {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setProblem(body?.error ?? "That did not save.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setProblem("That did not save. Check your connection.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const toggleActive = (item: Item) =>
    call(`/api/admin/settings/screening/${item.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !item.isActive }) });

  const remove = async (item: Item) => {
    const ok = await confirm({ title: "Delete this question?", description: "It is removed from the bank.", confirmLabel: "Delete", tone: "danger" });
    if (ok) await call(`/api/admin/settings/screening/${item.id}`, { method: "DELETE" });
  };

  return (
    <div className="space-y-8">
      <SettingsForm settings={settings} onSaved={() => router.refresh()} />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Question type">
            {(["EYE", "REL", "REWRITE"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={cn(
                  "min-h-[40px] rounded-full px-4 text-sm font-medium transition-colors",
                  tab === k ? "bg-primary text-primary-foreground" : "bg-zone text-muted-foreground hover:text-foreground"
                )}
              >
                {k === "EYE"
                  ? `Spot the AI (${activeEye} active)`
                  : k === "REL"
                    ? `Reference relevance (${activeRel} active)`
                    : `Rewrite (${activeRewrite} active)`}
              </button>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => (tab === "EYE" ? setAddingEye(true) : tab === "REL" ? setAddingRel(true) : setAddingRewrite(true))}
          >
            <LuPlus className="size-4" aria-hidden /> Add {tab === "EYE" ? "paragraph" : tab === "REL" ? "relevance set" : "paragraph"}
          </Button>
        </div>

        {problem ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-danger">
            <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {problem}
          </p>
        ) : null}

        {tab === "EYE" ? (
          eye.length === 0 ? (
            <p className="text-sm text-muted-foreground">No paragraphs yet. A sitting needs at least one.</p>
          ) : (
            <ul className="divide-y divide-border/70">
              {eye.map((item) => {
                const p = item.payload as { text?: string; source?: string | null };
                const isAI = Boolean((item.answerKey as { isAI?: boolean }).isAI);
                return (
                  <li key={item.id} className="py-3">
                    <div className="flex items-start gap-2">
                      <span className={cn("mt-0.5 rounded-full px-2 py-0.5 text-xs font-medium", isAI ? "bg-danger/15 text-danger" : "bg-success/15 text-success")}>
                        {isAI ? "AI" : "Human"}
                      </span>
                      <p className={cn("min-w-0 flex-1 text-sm", item.isActive ? "text-foreground" : "text-muted-foreground")}>{p.text}</p>
                      <RowActions item={item} busy={busy} onEdit={() => setEditing(item)} onToggle={() => void toggleActive(item)} onRemove={() => void remove(item)} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        ) : tab === "REL" ? (
          rel.length === 0 ? (
            <p className="text-sm text-muted-foreground">No relevance sets yet. A sitting draws one.</p>
          ) : (
            <ul className="divide-y divide-border/70">
              {rel.map((item) => {
                const p = item.payload as { topic?: string; sources?: unknown[] };
                return (
                  <li key={item.id} className="flex items-start gap-2 py-3">
                    <p className={cn("min-w-0 flex-1 text-sm", item.isActive ? "text-foreground" : "text-muted-foreground")}>
                      {p.topic}
                      <span className="ml-2 text-xs text-muted-foreground">{(p.sources ?? []).length} sources</span>
                    </p>
                    <RowActions item={item} busy={busy} onEdit={() => setEditing(item)} onToggle={() => void toggleActive(item)} onRemove={() => void remove(item)} />
                  </li>
                );
              })}
            </ul>
          )
        ) : rewrite.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rewrite paragraphs yet. One is drawn per sitting when you add one; without any, the sitting is just the first two parts.</p>
        ) : (
          <ul className="divide-y divide-border/70">
            {rewrite.map((item) => {
              const p = item.payload as { text?: string; note?: string | null };
              return (
                <li key={item.id} className="py-3">
                  <div className="flex items-start gap-2">
                    <p className={cn("min-w-0 flex-1 text-sm", item.isActive ? "text-foreground" : "text-muted-foreground")}>
                      {p.text}
                      {p.note ? <span className="mt-0.5 block text-xs text-muted-foreground">Note: {p.note}</span> : null}
                    </p>
                    <RowActions item={item} busy={busy} onEdit={() => setEditing(item)} onToggle={() => void toggleActive(item)} onRemove={() => void remove(item)} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {addingEye ? <EyeForm onClose={() => setAddingEye(false)} onSaved={() => { setAddingEye(false); router.refresh(); }} /> : null}
      {editing?.kind === "EYE" ? <EyeForm item={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} /> : null}
      {addingRel ? <RelForm onClose={() => setAddingRel(false)} onSaved={() => { setAddingRel(false); router.refresh(); }} /> : null}
      {editing?.kind === "REL" ? <RelForm item={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} /> : null}
      {addingRewrite ? <RewriteForm onClose={() => setAddingRewrite(false)} onSaved={() => { setAddingRewrite(false); router.refresh(); }} /> : null}
      {editing?.kind === "REWRITE" ? <RewriteForm item={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} /> : null}
    </div>
  );
}

function RowActions({ item, busy, onEdit, onToggle, onRemove }: { item: Item; busy: boolean; onEdit: () => void; onToggle: () => void; onRemove: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button type="button" disabled={busy} onClick={onToggle} className="text-xs text-muted-foreground underline-offset-4 hover:underline">
        {item.isActive ? "Deactivate" : "Activate"}
      </button>
      <Button type="button" variant="ghost" size="icon" aria-label="Edit" onClick={onEdit}>
        <LuPencil className="size-4" aria-hidden />
      </Button>
      <Button type="button" variant="ghost" size="icon" aria-label="Delete" disabled={busy} onClick={onRemove}>
        <LuTrash2 className="size-4 text-danger" aria-hidden />
      </Button>
    </div>
  );
}

function SettingsForm({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [passPercent, setPass] = React.useState(String(settings.passPercent));
  const [margin, setMargin] = React.useState(String(settings.borderlineMargin));
  const [minutes, setMinutes] = React.useState(String(settings.minutes));
  const [eyeCount, setEyeCount] = React.useState(String(settings.eyeCount));
  const [rewriteClaude, setRewriteClaude] = React.useState(settings.rewriteClaude);
  const [formatCount, setFormatCount] = React.useState(String(settings.formatCount));
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setProblem(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/settings/screening", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passPercent: Number(passPercent), borderlineMargin: Number(margin), minutes: Number(minutes), eyeCount: Number(eyeCount), rewriteClaude, formatCount: Number(formatCount) }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setProblem(body?.error ?? "That did not save.");
        return;
      }
      setSaved(true);
      onSaved();
    } catch {
      setProblem("That did not save. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">How the test runs</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Pass mark (%)" htmlFor="s-pass">
          <Input id="s-pass" type="number" min={1} max={100} value={passPercent} onChange={(e) => setPass(e.target.value)} />
        </Field>
        <Field label="Borderline band (%)" htmlFor="s-margin" hint="Below pass by this much → review">
          <Input id="s-margin" type="number" min={0} max={50} value={margin} onChange={(e) => setMargin(e.target.value)} />
        </Field>
        <Field label="Minutes" htmlFor="s-minutes">
          <Input id="s-minutes" type="number" min={5} max={240} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </Field>
        <Field label="Paragraphs drawn" htmlFor="s-eye">
          <Input id="s-eye" type="number" min={1} max={50} value={eyeCount} onChange={(e) => setEyeCount(e.target.value)} />
        </Field>
        <Field label="Formatting faults" htmlFor="s-format" hint="0 switches the practical off">
          <Input id="s-format" type="number" min={0} max={6} value={formatCount} onChange={(e) => setFormatCount(e.target.value)} />
        </Field>
      </div>
      <CheckboxRow checked={rewriteClaude} onChange={(e) => setRewriteClaude(e.target.checked)}>
        Also run an AI voice rubric on each rewrite (costs a small Claude charge per sitting; the phrase-scan score stands either way, this only adds a note for you)
      </CheckboxRow>
      {problem ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {problem}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void save()}>
          {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          Save settings
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

function EyeForm({ item, onClose, onSaved }: { item?: Item; onClose: () => void; onSaved: () => void }) {
  const p = (item?.payload ?? {}) as { text?: string; source?: string | null };
  const [text, setText] = React.useState(p.text ?? "");
  const [source, setSource] = React.useState(p.source ?? "");
  const [isAI, setIsAI] = React.useState(Boolean((item?.answerKey as { isAI?: boolean } | undefined)?.isAI));
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const url = item ? `/api/admin/settings/screening/${item.id}` : "/api/admin/settings/screening";
      const payload = { text, source: source || null };
      const answerKey = { isAI };
      const res = await fetch(url, {
        method: item ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item ? { payload, answerKey } : { kind: "EYE", payload, answerKey }),
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

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Edit paragraph" : "Add a paragraph"}</DialogTitle>
          <DialogDescription>A real paragraph, written either by a person or by AI. Mark which, and the candidate has to tell.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Paragraph" htmlFor="eye-text" required>
            <Textarea id="eye-text" value={text} onChange={(e) => setText(e.target.value)} rows={6} maxLength={4000} />
          </Field>
          <CheckboxRow checked={isAI} onChange={(e) => setIsAI(e.target.checked)}>
            This paragraph was written by AI
          </CheckboxRow>
          <Field label="Where it is from" htmlFor="eye-source" hint="A private note for you, never shown to the candidate. Optional.">
            <Input id="eye-source" value={source} onChange={(e) => setSource(e.target.value)} maxLength={300} />
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
            <Button type="button" disabled={busy || text.trim().length < 40} onClick={() => void save()}>
              {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RewriteForm({ item, onClose, onSaved }: { item?: Item; onClose: () => void; onSaved: () => void }) {
  const p = (item?.payload ?? {}) as { text?: string; note?: string | null };
  const [text, setText] = React.useState(p.text ?? "");
  const [note, setNote] = React.useState(p.note ?? "");
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const url = item ? `/api/admin/settings/screening/${item.id}` : "/api/admin/settings/screening";
      const payload = { text, note: note || null };
      const res = await fetch(url, {
        method: item ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item ? { payload, answerKey: {} } : { kind: "REWRITE", payload, answerKey: {} }),
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

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Edit rewrite paragraph" : "Add a rewrite paragraph"}</DialogTitle>
          <DialogDescription>
            An AI-sounding paragraph for the candidate to recast in a plain voice. It has to carry real tells — a stock opener,
            hype, a filler transition, meta-commentary or first person — or it will not save.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="The AI-sounding paragraph" htmlFor="rw-text" required>
            <Textarea id="rw-text" value={text} onChange={(e) => setText(e.target.value)} rows={7} maxLength={4000} />
          </Field>
          <Field label="A private note" htmlFor="rw-note" hint="Only you see this, never the candidate. Optional.">
            <Input id="rw-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
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
            <Button type="button" disabled={busy || text.trim().length < 60} onClick={() => void save()}>
              {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface SourceDraft {
  title: string;
  authors: string;
  year: string;
  journal: string;
  abstract: string;
  label: RelevanceLabel;
}
const EMPTY_SOURCE: SourceDraft = { title: "", authors: "", year: "", journal: "", abstract: "", label: "CORE" };

function RelForm({ item, onClose, onSaved }: { item?: Item; onClose: () => void; onSaved: () => void }) {
  const p = (item?.payload ?? {}) as { topic?: string; sources?: { title?: string; authors?: string | null; year?: number | null; journal?: string | null; abstract?: string | null }[] };
  const keyLabels = ((item?.answerKey as { labels?: RelevanceLabel[] } | undefined)?.labels ?? []) as RelevanceLabel[];
  const [topic, setTopic] = React.useState(p.topic ?? "");
  const [sources, setSources] = React.useState<SourceDraft[]>(() =>
    Array.from({ length: RELEVANCE_SOURCE_COUNT }, (_, i) => {
      const s = p.sources?.[i];
      return s
        ? {
            title: s.title ?? "",
            authors: s.authors ?? "",
            year: s.year != null ? String(s.year) : "",
            journal: s.journal ?? "",
            abstract: s.abstract ?? "",
            label: keyLabels[i] ?? "CORE",
          }
        : { ...EMPTY_SOURCE };
    })
  );
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  const setSource = (i: number, patch: Partial<SourceDraft>) => setSources((arr) => arr.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const canSave = topic.trim().length >= 5 && sources.every((s) => s.title.trim() !== "");

  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const payload = {
        topic,
        sources: sources.map((s) => ({
          title: s.title,
          authors: s.authors || null,
          year: s.year ? Number(s.year) : null,
          journal: s.journal || null,
          abstract: s.abstract || null,
        })),
      };
      const answerKey = { labels: sources.map((s) => s.label) };
      const url = item ? `/api/admin/settings/screening/${item.id}` : "/api/admin/settings/screening";
      const res = await fetch(url, {
        method: item ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item ? { payload, answerKey } : { kind: "REL", payload, answerKey }),
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

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Edit relevance set" : "Add a relevance set"}</DialogTitle>
          <DialogDescription>A project topic and ten sources, each with the relevance a good writer would give it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Project topic" htmlFor="rel-topic" required>
            <Textarea id="rel-topic" value={topic} onChange={(e) => setTopic(e.target.value)} rows={2} maxLength={500} />
          </Field>
          <ol className="space-y-3">
            {sources.map((s, i) => (
              <li key={i} className="rounded-xl bg-zone p-3">
                <p className="meta-label">Source {i + 1}</p>
                <Input className="mt-1" value={s.title} onChange={(e) => setSource(i, { title: e.target.value })} placeholder="Title" maxLength={300} />
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <Input value={s.authors} onChange={(e) => setSource(i, { authors: e.target.value })} placeholder="Authors" maxLength={200} />
                  <Input value={s.year} onChange={(e) => setSource(i, { year: e.target.value.replace(/[^0-9]/g, "") })} placeholder="Year" maxLength={4} inputMode="numeric" />
                  <Input value={s.journal} onChange={(e) => setSource(i, { journal: e.target.value })} placeholder="Journal" maxLength={200} />
                </div>
                <Textarea className="mt-2" value={s.abstract} onChange={(e) => setSource(i, { abstract: e.target.value })} rows={2} maxLength={1500} placeholder="Abstract (optional, but it helps the candidate judge)" />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {RELEVANCE_LABELS.map((label) => (
                    <label key={label} className={cn("flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm", s.label === label ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}>
                      <input type="radio" name={`label-${i}`} className="sr-only" checked={s.label === label} onChange={() => setSource(i, { label })} />
                      {RELEVANCE_LABEL_TEXT[label]}
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ol>
          {problem ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-danger">
              <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {problem}
            </p>
          ) : null}
          <div className="sticky bottom-0 flex justify-end gap-2 bg-card py-2">
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
