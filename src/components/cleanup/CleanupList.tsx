"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuFlaskConical, LuSearch, LuTrash2 } from "react-icons/lu";
import type { ProjectStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/projects/StatusBadge";
import { DeleteProjectsDialog } from "@/components/cleanup/DeleteProjectsDialog";
import { CLEANUP_TEXT } from "@/lib/project-cleanup";
import type { CleanupRow } from "@/lib/services/project-cleanup";
import { cn, formatDate, formatNaira } from "@/lib/utils";

/**
 * The founder's cleanup list: flagged projects first, then likely tests and
 * the newest projects (or a search). Tick the ones to delete, then review.
 * A project that can't be deleted says why instead of offering a tick box.
 */
export function CleanupList({ flagged, others, q }: { flagged: CleanupRow[]; others: CleanupRow[]; q: string }) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [open, setOpen] = React.useState(false);

  function toggle(code: string) {
    setSelected((s) => (s.includes(code) ? s.filter((c) => c !== code) : [...s, code]));
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
          <LuFlaskConical className="size-4 text-gold" aria-hidden />
          {CLEANUP_TEXT.flaggedHeading}
          <span className="font-mono text-[13px] font-normal tabular-nums text-muted-foreground">{flagged.length}</span>
        </h3>
        {flagged.length ? (
          <RowList rows={flagged} selected={selected} onToggle={toggle} />
        ) : (
          <p className="max-w-[65ch] text-sm text-muted-foreground">{CLEANUP_TEXT.flaggedEmpty}</p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-foreground">{q ? `Projects matching "${q}"` : CLEANUP_TEXT.othersHeading}</h3>
            {!q ? <p className="mt-1 text-sm text-muted-foreground">{CLEANUP_TEXT.searchHint}</p> : null}
          </div>
          <form method="get" role="search" className="flex w-full gap-2 sm:w-auto">
            <label className="relative block min-w-0 flex-1 sm:w-72">
              <LuSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
              <span className="sr-only">Search projects</span>
              <Input name="q" defaultValue={q} placeholder="Code, title or client" className="pl-9" />
            </label>
            <Button type="submit" variant="outline">
              Search
            </Button>
          </form>
        </div>
        {q ? (
          <Link href="/admin/settings/cleanup" className="inline-block text-sm text-primary hover:underline">
            Clear the search
          </Link>
        ) : null}
        {others.length ? (
          <RowList rows={others} selected={selected} onToggle={toggle} />
        ) : (
          <p className="text-sm text-muted-foreground">No projects to show.</p>
        )}
      </section>

      {selected.length ? (
        <div className="sticky bottom-20 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card p-3 shadow-lift md:bottom-4">
          <p className="text-sm text-foreground">
            <span className="font-mono tabular-nums">{selected.length}</span> selected
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setSelected([])}>
              Clear
            </Button>
            <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
              <LuTrash2 className="size-4" aria-hidden />
              {CLEANUP_TEXT.reviewButton(selected.length)}
            </Button>
          </div>
        </div>
      ) : null}

      <DeleteProjectsDialog
        codes={selected}
        open={open}
        onOpenChange={setOpen}
        onFinished={(results) => {
          const gone = new Set(results.filter((r) => r.ok).map((r) => r.code));
          setSelected((s) => s.filter((c) => !gone.has(c)));
          router.refresh();
        }}
      />
    </div>
  );
}

function RowList({ rows, selected, onToggle }: { rows: CleanupRow[]; selected: string[]; onToggle: (code: string) => void }) {
  return (
    <ul>
      {rows.map((r) => {
        const blocked = r.refusals.length > 0;
        const id = `cleanup-${r.code}`;
        return (
          <li key={r.code} className="flex items-start gap-3 border-t border-border/70 py-3 first:border-t-0">
            {/* The whole 44px square is the tap target on a phone. */}
            <label className={cn("-ml-2 flex size-11 shrink-0 items-start justify-center pt-1", blocked ? "cursor-not-allowed" : "cursor-pointer")}>
              <span className="sr-only">Select {r.code}</span>
              <input
                id={id}
                type="checkbox"
                className="size-4 accent-primary disabled:opacity-40"
                checked={selected.includes(r.code)}
                disabled={blocked}
                onChange={() => onToggle(r.code)}
                aria-describedby={blocked ? `${id}-why` : undefined}
              />
            </label>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <label htmlFor={id} className={cn("font-mono text-sm font-medium text-foreground", blocked ? "cursor-default" : "cursor-pointer")}>
                  {r.code}
                </label>
                <StatusBadge status={r.status as ProjectStatus} short />
                {r.isProBono ? <span className="text-xs text-muted-foreground">Pro bono</span> : null}
                <Link href={`/admin/projects/${r.code}`} className="text-xs text-primary hover:underline">
                  Open
                </Link>
              </div>
              <p className="truncate text-sm text-foreground">{r.title ?? "Untitled project"}</p>
              <p className="text-[13px] text-muted-foreground">
                {r.clientName} <span className="font-mono">{r.clientCode}</span> · created {formatDate(r.createdAt)}
                {r.moneyIn ? (
                  <>
                    {" · "}
                    <span className="font-mono tabular-nums text-foreground">{formatNaira(r.moneyIn)}</span> paid
                  </>
                ) : null}
              </p>
              {r.flagged ? (
                <p className="text-[13px] text-gold">
                  Flagged by {r.flagged.by ?? "someone"} on {formatDate(r.flagged.at)}
                  {r.flagged.note ? `: ${r.flagged.note}` : ""}
                </p>
              ) : null}
              {r.signals.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {r.signals.map((s) => (
                    <span key={s} className="rounded-full bg-zone px-2 py-0.5 text-xs text-muted-foreground">
                      {s}
                    </span>
                  ))}
                </div>
              ) : null}
              {blocked ? (
                <p id={`${id}-why`} className="text-[13px] text-danger">
                  {r.refusals[0]}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
