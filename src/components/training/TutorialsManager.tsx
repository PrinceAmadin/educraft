"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  LuArrowDown,
  LuArrowUp,
  LuCircleAlert,
  LuCircleCheck,
  LuListChecks,
  LuLoaderCircle,
  LuPencil,
  LuPlus,
  LuTrash2,
} from "react-icons/lu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm";
import { Field } from "@/components/forms/Field";
import { CheckboxRow } from "@/components/forms/CheckboxRow";
import { TrainingVideoUpload } from "@/components/training/TrainingVideoUpload";
import { QuizEditor } from "@/components/training/QuizEditor";
import { episodeLabel, type TrainingAudience } from "@/lib/training/rules";
import { roughLength } from "@/lib/training/video-rules";
import { cn } from "@/lib/utils";

/**
 * The founder's side of /admin/tutorials: the episode curriculum for both
 * audiences — add, edit, upload, publish, reorder, reset and delete. Only the
 * founder sees this (the page checks), and every route it calls re-checks
 * `requireSuperAdmin`.
 *
 * Publishing is the live switch: a published COO episode appears in the
 * COO's library at once, and the first published worker episode gates every
 * worker, so the publish and reset actions ask first.
 */

export interface ManagedEpisodeProps {
  id: string;
  audience: TrainingAudience;
  episodeNo: number;
  title: string;
  description: string | null;
  videoUrl: string;
  posterUrl: string;
  durationSeconds: number | null;
  requiredForGate: boolean;
  isPublished: boolean;
  quizPassPercent: number | null;
  questionCount: number;
  watchedCount: number;
}

export interface CooViewerProps {
  userId: string;
  name: string;
  episodes: Record<string, { watchedAt: string | null; startedAt: string | null }>;
}

const AUDIENCE_LABEL: Record<TrainingAudience, string> = {
  COO: "COO tutorials",
  WORKER: "Worker series",
};

export function TutorialsManager({
  episodes,
  cooViewers,
}: {
  episodes: ManagedEpisodeProps[];
  cooViewers: CooViewerProps[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [audience, setAudience] = React.useState<TrainingAudience>("COO");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<ManagedEpisodeProps | null>(null);
  const [quizFor, setQuizFor] = React.useState<ManagedEpisodeProps | null>(null);

  const rows = episodes.filter((e) => e.audience === audience).sort((a, b) => a.episodeNo - b.episodeNo);

  async function call(key: string, url: string, init: RequestInit): Promise<boolean> {
    setBusy(key);
    setProblem(null);
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setProblem(body?.error ?? "That did not save. Try again.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setProblem("That did not save. Check your connection and try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function togglePublish(episode: ManagedEpisodeProps) {
    if (!episode.isPublished) {
      const gating = episode.audience === "WORKER";
      const ok = await confirm({
        title: `Publish ${episodeLabel(episode.episodeNo)}?`,
        description: gating
          ? "Every worker who has not watched it will be held at the training gate the next time they open their dashboard."
          : "It appears in the COO's library at once.",
        confirmLabel: "Publish",
      });
      if (!ok) return;
    }
    await call(`publish-${episode.id}`, `/api/admin/tutorials/${episode.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isPublished: !episode.isPublished }),
    });
  }

  async function resetWatches(episode: ManagedEpisodeProps) {
    const ok = await confirm({
      title: `Reset who has watched ${episodeLabel(episode.episodeNo)}?`,
      description:
        episode.audience === "WORKER"
          ? `Everyone's progress on this episode starts over, and every worker is held at the gate again until they re-watch it. ${episode.watchedCount} people have watched it.`
          : `The watched marks on this tutorial start over. ${episode.watchedCount} people have watched it.`,
      confirmLabel: "Reset",
      tone: "danger",
    });
    if (!ok) return;
    await call(`reset-${episode.id}`, `/api/admin/tutorials/${episode.id}/reset-watches`, { method: "POST" });
  }

  async function remove(episode: ManagedEpisodeProps) {
    const ok = await confirm({
      title: `Delete ${episodeLabel(episode.episodeNo)} — ${episode.title}?`,
      description: "The episode and everyone's progress on it are removed. The uploaded video stays on the file store.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    await call(`delete-${episode.id}`, `/api/admin/tutorials/${episode.id}`, { method: "DELETE" });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Manage episodes</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Only you see this. An episode is visible once it has a video and is published.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => setAdding(true)}>
          <LuPlus className="size-4" aria-hidden /> Add episode
        </Button>
      </div>

      <div className="flex gap-1.5" role="tablist" aria-label="Audience">
        {(Object.keys(AUDIENCE_LABEL) as TrainingAudience[]).map((a) => (
          <button
            key={a}
            type="button"
            role="tab"
            aria-selected={audience === a}
            onClick={() => setAudience(a)}
            className={cn(
              "min-h-[40px] rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              audience === a ? "bg-primary text-primary-foreground" : "bg-zone text-muted-foreground hover:text-foreground"
            )}
          >
            {AUDIENCE_LABEL[a]}
          </button>
        ))}
      </div>

      {problem ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {problem}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No {AUDIENCE_LABEL[audience].toLowerCase()} yet — add the first episode.</p>
      ) : (
        <ul className="divide-y divide-border/70">
          {rows.map((episode, i) => (
            <li key={episode.id} className="py-3">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="eyebrow">{episodeLabel(episode.episodeNo)}</p>
                  <p className="text-sm font-medium text-foreground">{episode.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[
                      roughLength(episode.durationSeconds),
                      `${episode.watchedCount} watched`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge variant={episode.isPublished ? "success" : "neutral"}>
                      {episode.isPublished ? "Published" : "Draft"}
                    </Badge>
                    {episode.videoUrl ? null : <Badge variant="warning">No video yet</Badge>}
                    {episode.audience === "WORKER" && !episode.requiredForGate ? (
                      <Badge variant="neutral">Optional</Badge>
                    ) : null}
                  </div>
                  {episode.audience === "COO" && cooViewers.length > 0 ? (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {cooViewers
                        .map((v) => {
                          const w = v.episodes[episode.id];
                          const state = w?.watchedAt
                            ? `watched ${new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" }).format(new Date(w.watchedAt))}`
                            : w?.startedAt
                              ? "started, not finished"
                              : "not watched";
                          return `${v.name} — ${state}`;
                        })
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Move up"
                    disabled={i === 0 || busy != null}
                    onClick={() => void call(`move-${episode.id}`, `/api/admin/tutorials/${episode.id}`, { method: "PATCH", body: JSON.stringify({ move: "up" }) })}
                  >
                    <LuArrowUp className="size-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Move down"
                    disabled={i === rows.length - 1 || busy != null}
                    onClick={() => void call(`move-${episode.id}`, `/api/admin/tutorials/${episode.id}`, { method: "PATCH", body: JSON.stringify({ move: "down" }) })}
                  >
                    <LuArrowDown className="size-4" aria-hidden />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label="Edit" onClick={() => setEditing(episode)}>
                    <LuPencil className="size-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Delete"
                    disabled={busy != null}
                    onClick={() => void remove(episode)}
                  >
                    <LuTrash2 className="size-4 text-danger" aria-hidden />
                  </Button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy != null || (!episode.isPublished && !episode.videoUrl)}
                  onClick={() => void togglePublish(episode)}
                >
                  {busy === `publish-${episode.id}` ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                  {episode.isPublished ? "Unpublish" : "Publish"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy != null || episode.watchedCount === 0}
                  onClick={() => void resetWatches(episode)}
                >
                  Reset who has watched this
                </Button>
                {episode.audience === "WORKER" ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => setQuizFor(episode)}>
                    <LuListChecks className="size-4" aria-hidden />
                    {episode.questionCount > 0 ? `Quiz (${episode.questionCount})` : "Add a quiz"}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddEpisodeDialog
        open={adding}
        audience={audience}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false);
          router.refresh();
        }}
      />
      {editing ? (
        <EditEpisodeDialog
          episode={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}
      {quizFor ? (
        <QuizEditor episode={quizFor} onClose={() => setQuizFor(null)} onChanged={() => router.refresh()} />
      ) : null}
    </section>
  );
}

function AddEpisodeDialog({
  open,
  audience,
  onClose,
  onSaved,
}: {
  open: boolean;
  audience: TrainingAudience;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [required, setRequired] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setRequired(true);
      setProblem(null);
    }
  }, [open]);

  async function save() {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch("/api/admin/tutorials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audience,
          title,
          description: description || undefined,
          requiredForGate: audience === "WORKER" ? required : undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setProblem(body?.error ?? "That did not save. Try again.");
        return;
      }
      onSaved();
    } catch {
      setProblem("That did not save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add an episode — {AUDIENCE_LABEL[audience]}</DialogTitle>
          <DialogDescription>
            It starts as a draft: upload the video from Edit, then publish it when it is ready.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Title" htmlFor="episode-title" required>
            <Input id="episode-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </Field>
          <Field label="Description" htmlFor="episode-description" hint="One or two sentences on what it covers.">
            <Textarea
              id="episode-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
            />
          </Field>
          {audience === "WORKER" ? (
            <CheckboxRow checked={required} onChange={(e) => setRequired(e.target.checked)}>
              Required — an unwatched required episode holds the worker gate
            </CheckboxRow>
          ) : null}
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
            <Button type="button" disabled={busy || !title.trim()} onClick={() => void save()}>
              {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              Add episode
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditEpisodeDialog({
  episode,
  onClose,
  onSaved,
}: {
  episode: ManagedEpisodeProps;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = React.useState(episode.title);
  const [description, setDescription] = React.useState(episode.description ?? "");
  const [videoUrl, setVideoUrl] = React.useState(episode.videoUrl);
  const [posterUrl, setPosterUrl] = React.useState(episode.posterUrl);
  const [required, setRequired] = React.useState(episode.requiredForGate);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  async function save() {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/admin/tutorials/${episode.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || null,
          videoUrl,
          posterUrl,
          requiredForGate: episode.audience === "WORKER" ? required : undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setProblem(body?.error ?? "That did not save. Try again.");
        return;
      }
      onSaved();
    } catch {
      setProblem("That did not save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {episodeLabel(episode.episodeNo)} — {AUDIENCE_LABEL[episode.audience]}
          </DialogTitle>
          <DialogDescription>
            Replacing the video keeps everyone&apos;s watched marks (same episode, newer cut). For a genuinely new
            episode, add one instead — or reset the watches after replacing it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Title" htmlFor="edit-title" required>
            <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </Field>
          <Field label="Description" htmlFor="edit-description">
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
            />
          </Field>
          <Field
            label="Video file"
            htmlFor="edit-video"
            hint="Upload below, or paste an https link. mp4 or webm, up to 500 MB."
          >
            <Input id="edit-video" inputMode="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
          </Field>
          <TrainingVideoUpload label="Upload the video" kind="video" onUploaded={setVideoUrl} />
          <Field label="Poster image" htmlFor="edit-poster" hint="Shown before the video is played. Optional.">
            <Input id="edit-poster" inputMode="url" value={posterUrl} onChange={(e) => setPosterUrl(e.target.value)} />
          </Field>
          <TrainingVideoUpload label="Upload a poster" kind="poster" onUploaded={setPosterUrl} />
          {episode.audience === "WORKER" ? (
            <CheckboxRow checked={required} onChange={(e) => setRequired(e.target.checked)}>
              Required — an unwatched required episode holds the worker gate
            </CheckboxRow>
          ) : null}
          {videoUrl ? (
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <LuCircleCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              Video attached. Save, then publish from the list.
            </p>
          ) : null}
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
            <Button type="button" disabled={busy || !title.trim()} onClick={() => void save()}>
              {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
