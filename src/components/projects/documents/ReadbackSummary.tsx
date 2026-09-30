"use client";

import { LuCircleAlert, LuFileCheck, LuTriangleAlert } from "react-icons/lu";
import type { StoredReadback } from "@/lib/services/chapter-readback";
import { cn } from "@/lib/utils";

const num = (n: number) => n.toLocaleString("en-GB");

/** "3,120 → 3,245 words", or just "3,245 words" when it is the same as the AI draft. */
function change(label: string, pair: [number, number] | undefined, now: number): string {
  if (!pair || pair[0] === pair[1]) return `${num(now)} ${label}`;
  return `${num(pair[0])} → ${num(now)} ${label}`;
}

/**
 * Chapter review: what an uploaded chapter reads back as, the words, headings, tables, equations,
 * pictures and notes the complete report will take from it (against the AI draft), what must be fixed
 * before it can be approved, and what changes on the way. Shared by the COO's card and the specialist's panel.
 */
export function ReadbackSummary({ readback, audience, className }: { readback: StoredReadback | null; audience: "staff" | "specialist"; className?: string }) {
  if (!readback) {
    return <p className={cn("text-[13px] text-muted-foreground", className)}>Not read yet. Refresh in a moment.</p>;
  }
  const s = readback.summary;
  const c = readback.comparedToDraft;
  const blanks = s?.placeholders ?? [];
  return (
    <div className={cn("space-y-3", className)} data-readback={readback.blocking.length ? "blocked" : "clean"}>
      {s ? (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted-foreground">
          <LuFileCheck className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="text-foreground">{audience === "staff" ? "The report takes from this file:" : "Read back as:"}</span>
          <span className="font-mono tabular-nums">{change("words", c?.words, s.words)}</span>·
          <span className="font-mono tabular-nums">{change("headings", c?.headings, s.headings)}</span>·
          <span className="font-mono tabular-nums">{change("tables", c?.tables, s.tables)}</span>·
          <span className="font-mono tabular-nums">{change("equations", c?.equations, s.equations)}</span>·
          <span className="font-mono tabular-nums">{change("figures", c?.figures, s.figures)}</span>
          {s.images ? (
            <>
              · <span className="font-mono tabular-nums">{num(s.images)} picture{s.images === 1 ? "" : "s"}</span>
            </>
          ) : null}
          {s.notes || c?.notes?.[0] ? (
            <>
              · <span className="font-mono tabular-nums">{change("notes", c?.notes, s.notes)}</span>
            </>
          ) : null}
        </p>
      ) : null}

      {readback.blocking.length ? (
        <div className="rounded-xl bg-danger/10 p-3" role="alert">
          <p className="flex items-center gap-2 text-sm font-semibold text-danger">
            <LuCircleAlert className="size-4" aria-hidden />
            {audience === "staff" ? "Cannot be approved until fixed" : "Fix before the COO can approve it"}
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-foreground">
            {readback.blocking.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {blanks.length ? (
        <div className="rounded-xl bg-gold/10 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-gold">
            <LuTriangleAlert className="size-4" aria-hidden />
            Blanks still to fill in
          </p>
          <p className="mt-1 break-words font-mono text-[13px] text-foreground">{blanks.slice(0, 12).join("  ·  ")}</p>
        </div>
      ) : null}

      {readback.flags.length ? (
        <details className="group">
          <summary className="cursor-pointer text-[13px] font-medium text-muted-foreground hover:text-foreground">
            What changes on the way into the report ({readback.flags.length})
          </summary>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[13px] text-foreground">
            {readback.flags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
