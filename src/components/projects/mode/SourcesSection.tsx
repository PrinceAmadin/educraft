"use client";

import * as React from "react";
import { LuExternalLink, LuFileText, LuPlus, LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/Field";
import { FormSection } from "@/components/forms/FormSection";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { safeHref } from "@/lib/safe-href";
import type { BriefPointView, BriefSourceView, BriefView } from "@/lib/research/source-stage-view";
import { cn, formatNaira } from "@/lib/utils";

export interface ManualSourceDraft {
  pointIndex: number;
  title: string;
  court: string;
  decidedOn: string;
  citation: string;
  holder: string;
  reference: string;
  url: string;
}

const EMPTY_DRAFT: Omit<ManualSourceDraft, "pointIndex"> = { title: "", court: "", decidedOn: "", citation: "", holder: "", reference: "", url: "" };

function Chip({ tone, children }: { tone: "success" | "gold" | "zone" | "primary"; children: React.ReactNode }) {
  const tones = {
    success: "bg-success/15 text-success",
    gold: "bg-gold/15 text-gold",
    zone: "bg-zone text-muted-foreground",
    primary: "bg-primary/10 text-primary",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

function SourceRow({
  source,
  projectId,
  checked,
  onToggle,
  editable,
  busy,
  onRemove,
}: {
  source: BriefSourceView;
  projectId: string;
  checked: boolean;
  onToggle: (on: boolean) => void;
  editable: boolean;
  busy: boolean;
  onRemove: () => void;
}) {
  const id = `source-${source.id}`;
  const found = safeHref(source.sourceUrl);
  const isCase = source.kind === "CASE";
  const meta = isCase ? [source.court, source.decidedOn].filter(Boolean) : [source.holder, source.decidedOn].filter(Boolean);
  const code = isCase ? source.citation ?? source.suitNumber : source.reference;
  return (
    <li className="flex min-h-12 items-start gap-3 py-3">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 cursor-pointer accent-primary disabled:cursor-default"
        checked={checked}
        disabled={!editable}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <label htmlFor={id} className={cn("block break-words text-sm font-medium text-foreground", editable && "cursor-pointer")}>
          {source.title}
        </label>
        {meta.length || code ? (
          <p className="break-words text-xs text-muted-foreground">
            {meta.join(" · ")}
            {meta.length && code ? " · " : ""}
            {code ? <span className="font-mono">{code}</span> : null}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {source.addedByCoo ? (
            <Chip tone="zone">Added by the COO</Chip>
          ) : isCase ? (
            source.confirmed ? (
              <Chip tone="success">Official record</Chip>
            ) : (
              <Chip tone="gold">Not confirmed</Chip>
            )
          ) : (
            <Chip tone={source.recordType === "Thesis" ? "zone" : "primary"}>{source.recordType === "Thesis" ? "Thesis" : "Primary record"}</Chip>
          )}
          {isCase && source.confirmed && (source.hasPdf || source.officialUrl) ? (
            <a
              href={`/api/admin/projects/${projectId}/mode/sources/${source.id}/file`}
              className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <LuFileText className="size-3.5" aria-hidden />
              Judgment PDF
            </a>
          ) : null}
          {found ? (
            <a
              href={found}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <LuExternalLink className="size-3.5" aria-hidden />
              {isCase ? `Found at ${source.sourceDomain ?? "the source"}` : `Open in ${source.originLabel}`}
            </a>
          ) : null}
          {source.addedByCoo && editable ? (
            <button
              type="button"
              disabled={busy}
              onClick={onRemove}
              className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-danger"
            >
              <LuTrash2 className="size-3.5" aria-hidden />
              Remove
            </button>
          ) : null}
        </div>
        {source.relevance ? <p className="text-sm text-muted-foreground">{source.relevance}</p> : null}
      </div>
    </li>
  );
}

/**
 * The cases (Law) or archival sources (History) found for a report, grouped by
 * the point each supports (D3b). The COO ticks what the chapters may cite:
 * confirmed cases come ticked, cases found only on the open web do not. A point
 * with nothing ticked is written as the placeholder in every chapter.
 */
export function SourcesSection({
  brief,
  projectId,
  selected,
  onToggle,
  editable,
  busy,
  onAdd,
  onRemove,
}: {
  brief: BriefView;
  projectId: string;
  selected: Set<string>;
  onToggle: (id: string, on: boolean) => void;
  editable: boolean;
  busy: string | null;
  onAdd: (draft: ManualSourceDraft) => Promise<boolean>;
  onRemove: (id: string) => void;
}) {
  const [adding, setAdding] = React.useState<BriefPointView | null>(null);
  const [draft, setDraft] = React.useState(EMPTY_DRAFT);
  // Nothing to show until points exist; a finished search with none is explained (with Search again) in the objectives section.
  if (!brief.sourceKind || brief.points.length === 0) return null;
  const isCase = brief.sourceKind === "CASE";
  const noun = isCase ? "case" : "source";

  return (
    <FormSection
      title={brief.kindLabel ?? "Sources"}
      description={`Tick what the chapters may cite. A point with nothing ticked is written as ${brief.placeholder}.${isCase ? " Cases not in the Supreme Court's own record start unticked: check the page they were found on first." : ""}`}
    >
      <p className="font-mono text-xs tabular-nums text-muted-foreground">
        {brief.searchesUsed} of {brief.searchLimit} searches · {formatNaira(brief.costNaira)} spent
      </p>
      <ol className="space-y-7">
        {brief.points.map((p) => {
          const ticked = p.sources.some((s) => selected.has(s.id));
          return (
            <li key={p.index} className="space-y-1">
              <p className="text-sm text-foreground">
                <span className="font-mono tabular-nums text-muted-foreground">{p.index + 1}.</span> <span className="font-medium">{p.text}</span>
              </p>
              {p.sources.length ? (
                <ul className="divide-y divide-border/60">
                  {p.sources.map((s) => (
                    <SourceRow
                      key={s.id}
                      source={s}
                      projectId={projectId}
                      checked={selected.has(s.id)}
                      onToggle={(on) => onToggle(s.id, on)}
                      editable={editable}
                      busy={busy !== null}
                      onRemove={() => onRemove(s.id)}
                    />
                  ))}
                </ul>
              ) : null}
              {!ticked && !brief.running ? (
                <p className="mt-2 rounded-xl bg-zone px-3 py-2.5 text-sm text-muted-foreground">
                  <span className="font-mono text-foreground">{brief.placeholder}</span>
                  {p.sources.length ? " — nothing ticked for this point." : ` — ${p.note ?? "nothing usable found."}`}
                </p>
              ) : null}
              {editable && brief.status === "READY" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1"
                  disabled={busy !== null}
                  onClick={() => {
                    setDraft(EMPTY_DRAFT);
                    setAdding(p);
                  }}
                >
                  <LuPlus aria-hidden />
                  Add a {noun} by hand
                </Button>
              ) : null}
            </li>
          );
        })}
      </ol>
      {brief.attribution ? <p className="text-xs text-muted-foreground">{brief.attribution}</p> : null}

      <Dialog open={adding !== null} onOpenChange={(open) => !open && setAdding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a {noun} by hand</DialogTitle>
            <DialogDescription>
              {adding ? `For point ${adding.index + 1}: ${adding.text}` : null} It is ticked and marked as added by the COO.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              // The dialog sits in a portal but inside the card form in the React tree: keep this submit from approving the card.
              e.preventDefault();
              e.stopPropagation();
              if (!adding) return;
              const ok = await onAdd({ ...draft, pointIndex: adding.index });
              if (ok) setAdding(null);
            }}
          >
            <Field label={isCase ? "Case name" : "Title of the record"} htmlFor="manual-title" required hint={isCase ? "The parties, joined by v., e.g. FRN v. Igbinedion" : undefined}>
              <Input id="manual-title" value={draft.title} maxLength={300} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </Field>
            {isCase ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Court" htmlFor="manual-court">
                  <Input id="manual-court" value={draft.court} maxLength={120} onChange={(e) => setDraft({ ...draft, court: e.target.value })} />
                </Field>
                <Field label="Year" htmlFor="manual-year">
                  <Input id="manual-year" value={draft.decidedOn} maxLength={40} inputMode="numeric" onChange={(e) => setDraft({ ...draft, decidedOn: e.target.value })} />
                </Field>
                <Field label="Citation" htmlFor="manual-citation" className="sm:col-span-2">
                  <Input id="manual-citation" value={draft.citation} maxLength={160} onChange={(e) => setDraft({ ...draft, citation: e.target.value })} />
                </Field>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Held by" htmlFor="manual-holder">
                  <Input id="manual-holder" value={draft.holder} maxLength={160} onChange={(e) => setDraft({ ...draft, holder: e.target.value })} />
                </Field>
                <Field label="Reference" htmlFor="manual-reference">
                  <Input id="manual-reference" value={draft.reference} maxLength={120} onChange={(e) => setDraft({ ...draft, reference: e.target.value })} />
                </Field>
                <Field label="Date" htmlFor="manual-date" className="sm:col-span-2">
                  <Input id="manual-date" value={draft.decidedOn} maxLength={40} onChange={(e) => setDraft({ ...draft, decidedOn: e.target.value })} />
                </Field>
              </div>
            )}
            <Field label="Link" htmlFor="manual-url" hint="Optional, must start with https://">
              <Input id="manual-url" type="url" value={draft.url} maxLength={1000} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setAdding(null)} disabled={busy !== null}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy !== null || draft.title.trim().length < 3}>
                {busy === "add" ? "Adding…" : `Add ${noun}`}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </FormSection>
  );
}
