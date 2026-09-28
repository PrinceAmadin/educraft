"use client";

import * as React from "react";
import Link from "next/link";
import { LuBookOpen, LuLoaderCircle, LuPencil, LuPlus, LuRefreshCw, LuTrash2, LuTriangleAlert, LuX } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { countWords } from "@/lib/generation/chapter-plan";
import type { PreliminaryPagesView } from "@/lib/services/preliminary-pages";
import { cn, formatDateTime } from "@/lib/utils";

const POLL_MS = 4000;
const POLL_LIMIT_MS = 4 * 60_000;

type Mode = "read" | "edit" | "confirm" | "writing";

/**
 * D7b: the acknowledgement, abstract and list of abbreviations the page writer
 * adds to a full report, on the Report tab for the founder and the COO. Read
 * them, correct them by hand (kept by every later automatic run), or write them
 * again (spends credits, replaces a hand edit). The quality gate writes them by
 * itself before it scores the report. The assigned specialist sees it read-only
 * (`readOnly`: no buttons, no staff names).
 */
export function PreliminaryPagesCard({
  initial,
  endpoint = "",
  editIntakeHref = "",
  readOnly = false,
}: {
  initial: PreliminaryPagesView;
  endpoint?: string;
  editIntakeHref?: string;
  readOnly?: boolean;
}) {
  const [view, setView] = React.useState(initial);
  const [mode, setMode] = React.useState<Mode>("read");
  const [error, setError] = React.useState<string | null>(null);
  const pages = view.pages;

  async function refresh(): Promise<PreliminaryPagesView | null> {
    const res = await fetch(endpoint, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return null;
    const next = (await res.json()) as PreliminaryPagesView;
    setView(next);
    return next;
  }

  async function write() {
    setError(null);
    setMode("writing");
    const before = pages?.updatedAt ?? null;
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: true }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "That didn't work. Try again.");
        setMode("read");
        return;
      }
      const started = Date.now();
      while (Date.now() - started < POLL_LIMIT_MS) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const next = await refresh();
        if (next?.pages && next.pages.updatedAt !== before) {
          setMode("read");
          return;
        }
      }
      setError("The pages are taking longer than usual. Reload this tab in a minute to see them.");
    } catch {
      setError("Could not reach EduCraft. Check your connection and try again.");
    }
    setMode("read");
  }

  return (
    <section className="space-y-5 rounded-2xl bg-zone p-4 sm:p-6" aria-labelledby="prelim-pages-heading">
      <div className="space-y-1.5">
        <p className="eyebrow flex items-center gap-2 text-primary">
          <LuBookOpen className="size-4" aria-hidden />
          Preliminary pages
        </p>
        <h2 id="prelim-pages-heading" className="text-lg font-semibold tracking-tight text-foreground">
          {pages ? "Acknowledgement, abstract and abbreviations" : "Acknowledgement, abstract and abbreviations: not written yet"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {pages
            ? pages.editedByHand
              ? readOnly
                ? `Corrected by EduCraft${pages.editedAt ? ` on ${formatDateTime(pages.editedAt)}` : ""}.`
                : `Edited by hand${pages.editedBy ? ` by ${pages.editedBy}` : ""}${pages.editedAt ? ` on ${formatDateTime(pages.editedAt)}` : ""}. The quality check keeps this text; only Write again replaces it.`
              : `Written ${formatDateTime(pages.updatedAt)} from the finished chapters. The quality check rewrites them when the chapters change.`
            : view.chaptersReady
              ? readOnly
                ? "The quality check writes them before it scores the report."
                : "The quality check writes them before it scores the report, or write them now."
              : "They are written from the finished chapters, once every chapter is written."}
        </p>
      </div>

      <Notices view={view} editIntakeHref={editIntakeHref} readOnly={readOnly} />

      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger" role="alert">
          <LuTriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      {mode === "edit" && pages ? (
        <EditForm
          view={view}
          endpoint={endpoint}
          onCancel={() => setMode("read")}
          onSaved={(next) => {
            setView(next);
            setMode("read");
          }}
        />
      ) : pages ? (
        <ReadPages view={view} />
      ) : null}

      {mode === "confirm" ? (
        <div className="space-y-3 rounded-xl bg-card p-3 shadow-soft" role="group" aria-label="Confirm writing the pages">
          <p className="text-sm text-foreground">
            {pages?.editedByHand
              ? "This writes the acknowledgement, abstract and list of abbreviations again from the chapters and replaces the text edited by hand. It spends Claude credits (about ₦40)."
              : "This writes the acknowledgement, abstract and list of abbreviations from the chapters. It spends Claude credits (about ₦40)."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => void write()}>
              <LuRefreshCw aria-hidden />
              {pages ? "Write again" : "Write now"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode("read")}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {!readOnly && (mode === "read" || mode === "writing") ? (
        <div className="flex flex-wrap items-center gap-3">
          {pages ? (
            <Button type="button" variant="outline" onClick={() => setMode("edit")} disabled={mode === "writing"}>
              <LuPencil aria-hidden />
              Edit
            </Button>
          ) : null}
          <Button type="button" variant={pages ? "ghost" : "default"} onClick={() => setMode("confirm")} disabled={mode === "writing" || !view.chaptersReady}>
            {mode === "writing" ? <LuLoaderCircle className="animate-spin" aria-hidden /> : <LuRefreshCw aria-hidden />}
            {mode === "writing" ? "Writing…" : pages ? "Write again" : "Write now"}
          </Button>
          {mode === "writing" ? <p className="text-xs text-muted-foreground">This takes about a minute.</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function Notices({ view, editIntakeHref, readOnly }: { view: PreliminaryPagesView; editIntakeHref: string; readOnly: boolean }) {
  const pages = view.pages;
  const lines: { tone: "gold" | "muted"; text: React.ReactNode }[] = [];
  if (pages?.needsReview)
    lines.push({ tone: "gold", text: `The abstract is ${pages.abstractWords} words; it should be ${view.band.min}–${view.band.max}.${readOnly ? " EduCraft reviews it." : " Edit it, or write it again."}` });
  if (view.blanks.length)
    lines.push({
      tone: "gold",
      text: `The text still has blanks: ${view.blanks.join(", ")}.${readOnly ? "" : " Add the details on Edit intake and write the pages again, or fill them in by hand."}`,
    });
  if (pages?.changedSince)
    lines.push({
      tone: "gold",
      text: readOnly
        ? "The chapters changed since this was written."
        : pages.editedByHand
        ? "The chapters or the order details changed after this was written. The hand edit is kept, so check that it still matches the report."
        : "The chapters or the order details changed since this was written. The next quality check writes it again.",
    });
  if (view.qaCopyOlder && !readOnly)
    lines.push({
      tone: "muted",
      text: `The copy sent to QA on ${formatDateTime(view.qaCopyOlder)} was built before this change. To send the new text, download the report again and upload it as a new version on the Documents tab.`,
    });
  if (view.intakeGaps.length)
    lines.push({
      tone: "muted",
      text: (
        <>
          Not in the order: {view.intakeGaps.join(", ")}.
          {readOnly ? null : (
            <>
              {" "}
              <Link href={editIntakeHref} className="font-medium text-primary underline-offset-4 hover:underline">
                Add {view.intakeGaps.length === 1 ? "it" : "them"} on Edit intake
              </Link>
              .
            </>
          )}
        </>
      ),
    });
  if (!lines.length) return null;
  return (
    <ul className="space-y-2">
      {lines.map((l, i) => (
        <li key={i} className={cn("flex items-start gap-2 text-sm", l.tone === "gold" ? "text-gold" : "text-muted-foreground")}>
          <LuTriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="min-w-0">{l.text}</span>
        </li>
      ))}
    </ul>
  );
}

const paragraphs = (text: string) =>
  text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

function ReadPages({ view }: { view: PreliminaryPagesView }) {
  const pages = view.pages!;
  const outOfBand = pages.abstractWords < view.band.min || pages.abstractWords > view.band.max;
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-[15px] font-semibold text-foreground">Acknowledgement</h3>
        {paragraphs(pages.acknowledgement).map((p, i) => (
          <p key={i} className="text-sm leading-relaxed text-foreground">
            {p}
          </p>
        ))}
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[15px] font-semibold text-foreground">Abstract</h3>
          <span className={cn("font-mono text-xs tabular-nums", outOfBand ? "text-gold" : "text-muted-foreground")}>
            {pages.abstractWords} words · {view.band.min}–{view.band.max}
          </span>
        </div>
        {paragraphs(pages.abstract).map((p, i) => (
          <p key={i} className="text-sm leading-relaxed text-foreground">
            {p}
          </p>
        ))}
      </div>
      <div className="space-y-2">
        <h3 className="text-[15px] font-semibold text-foreground">List of abbreviations ({pages.abbreviations.length})</h3>
        {pages.abbreviations.length ? (
          <ul className="divide-y divide-border/60">
            {pages.abbreviations.map((a) => (
              <li key={a.token} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
                <span className="w-28 shrink-0 break-words text-sm font-semibold text-foreground">{a.token}</span>
                <span className="min-w-0 text-sm text-foreground">{a.expansion}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">None. The page says the report has no abbreviations that need expanding.</p>
        )}
      </div>
    </div>
  );
}

function EditForm({
  view,
  endpoint,
  onCancel,
  onSaved,
}: {
  view: PreliminaryPagesView;
  endpoint: string;
  onCancel: () => void;
  onSaved: (next: PreliminaryPagesView) => void;
}) {
  const pages = view.pages!;
  const [acknowledgement, setAcknowledgement] = React.useState(pages.acknowledgement);
  const [abstract, setAbstract] = React.useState(pages.abstract);
  const [rows, setRows] = React.useState(() => pages.abbreviations.map((a, i) => ({ key: i, token: a.token, expansion: a.expansion })));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const nextKey = React.useRef(rows.length);
  const words = countWords(abstract);
  const outOfBand = words < view.band.min || words > view.band.max;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acknowledgement,
          abstract,
          abbreviations: rows.filter((r) => r.token.trim() || r.expansion.trim()).map((r) => ({ token: r.token, expansion: r.expansion })),
          loadedAt: pages.updatedAt,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "That didn't save. Try again.");
        return;
      }
      onSaved(body as PreliminaryPagesView);
    } catch {
      setError("Could not reach EduCraft. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="space-y-2">
        <label htmlFor="prelim-ack" className="text-[15px] font-semibold text-foreground">
          Acknowledgement
        </label>
        <Textarea id="prelim-ack" rows={8} value={acknowledgement} onChange={(e) => setAcknowledgement(e.target.value)} />
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <label htmlFor="prelim-abstract" className="text-[15px] font-semibold text-foreground">
            Abstract
          </label>
          <span className={cn("font-mono text-xs tabular-nums", outOfBand ? "text-gold" : "text-muted-foreground")} aria-live="polite">
            {words} words · {view.band.min}–{view.band.max}
          </span>
        </div>
        <Textarea id="prelim-abstract" rows={12} value={abstract} onChange={(e) => setAbstract(e.target.value)} />
        <p className="text-xs text-muted-foreground">Leave a blank line between paragraphs.</p>
      </div>
      <fieldset className="space-y-3">
        <legend className="text-[15px] font-semibold text-foreground">List of abbreviations</legend>
        {rows.length ? (
          <ul className="space-y-3">
            {rows.map((r, i) => (
              <li key={r.key} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  aria-label={`Abbreviation ${i + 1}`}
                  placeholder="SPSS"
                  className="sm:w-36"
                  value={r.token}
                  onChange={(e) => setRows((list) => list.map((x) => (x.key === r.key ? { ...x, token: e.target.value } : x)))}
                />
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Input
                    aria-label={`Meaning of abbreviation ${i + 1}`}
                    placeholder="Statistical Package for the Social Sciences"
                    value={r.expansion}
                    onChange={(e) => setRows((list) => list.map((x) => (x.key === r.key ? { ...x, expansion: e.target.value } : x)))}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${r.token || `abbreviation ${i + 1}`}`}
                    onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}
                  >
                    <LuTrash2 aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No abbreviations. The page will say the report has none that need expanding.</p>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => setRows((list) => [...list, { key: nextKey.current++, token: "", expansion: "" }])}>
          <LuPlus aria-hidden />
          Add abbreviation
        </Button>
        <p className="text-xs text-muted-foreground">Sorted A–Z when saved.</p>
      </fieldset>

      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger" role="alert">
          <LuTriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? <LuLoaderCircle className="animate-spin" aria-hidden /> : null}
          {saving ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          <LuX aria-hidden />
          Cancel
        </Button>
      </div>
    </form>
  );
}
