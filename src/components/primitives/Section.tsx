import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Composition primitives.
 *
 * These deliberately do NOT provide a card, a panel or a bordered box. A
 * section's boundary is communicated by its ground, its rhythm and the
 * hairline that opens it — never by a rectangle drawn around its contents.
 */

/* ── Ground ───────────────────────────────────────────────────
   Sections alternate between two grounds and meet through a
   gradient seam, so no two adjacent sections share an edge. */

type Ground = "a" | "b" | "into-b" | "into-a" | "ink";

const groundClass: Record<Ground, string> = {
  a: "bg-background",
  b: "ground-b",
  "into-b": "seam-into-b",
  "into-a": "seam-into-a",
  /* Re-scopes the semantic tokens rather than hard-coding colours — see
     `.ground-ink` in globals.css. */
  ink: "ground-ink",
};

type Rhythm = "tight" | "normal" | "open";

const rhythmClass: Record<Rhythm, string> = {
  tight: "py-[clamp(3.5rem,7vh,5.5rem)]",
  normal: "py-section",
  open: "py-section-lg",
};

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  ground?: Ground;
  rhythm?: Rhythm;
  /** Renders the grain overlay. Only for large gradient fields. */
  grain?: boolean;
}

export function Section({
  ground = "a",
  rhythm = "normal",
  grain = false,
  className,
  children,
  ...rest
}: SectionProps) {
  return (
    <section
      className={cn(
        "relative isolate",
        groundClass[ground],
        rhythmClass[rhythm],
        grain && "grain",
        className
      )}
      {...rest}
    >
      {children}
    </section>
  );
}

/* ── Editorial metadata ───────────────────────────────────────
   Small mono type set against large display type is the primary
   source of hierarchy on this page — it does more work than any
   border could. */

export function Eyebrow({
  index,
  children,
  className,
}: {
  /** Section number, e.g. "02". Rendered before a hairline separator. */
  index?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("eyebrow flex items-center gap-3", className)}>
      {index && (
        <>
          <span className="text-primary">{index}</span>
          <span aria-hidden className="h-px w-8 bg-hairline/25" />
        </>
      )}
      <span>{children}</span>
    </p>
  );
}

/**
 * Statement type.
 *
 * Line breaks are authored, never left to the browser: pass an array and each
 * entry becomes its own line.
 *
 * Deliberately NOT `white-space: nowrap`. A forced line that outgrows its
 * column does not shrink — it overruns into whatever sits beside it, and at
 * these sizes that is a collision, not a bleed. The type scale is capped so
 * the authored lines fit; if a heading is ever rewritten longer than its
 * column, it wraps and only the rhythm is lost. The hero is the one place
 * that overruns on purpose, and it does so with its own scale.
 */
export function DisplayHeading({
  as: Tag = "h2",
  lines,
  scale = "headline",
  className,
  id,
}: {
  as?: "h1" | "h2" | "h3";
  lines: React.ReactNode[];
  scale?: "display" | "display-sm" | "headline" | "headline-sm";
  className?: string;
  id?: string;
}) {
  const scaleClass = {
    display: "text-display",
    "display-sm": "text-display-sm",
    headline: "text-headline",
    "headline-sm": "text-headline-sm",
  }[scale];

  return (
    <Tag
      id={id}
      className={cn("font-display font-semibold text-foreground", scaleClass, className)}
    >
      {lines.map((line, i) => (
        <span key={i} className="block">
          {line}
        </span>
      ))}
    </Tag>
  );
}

/** Full-width hairline. The page's only horizontal divider. */
export function Rule({ className }: { className?: string }) {
  return <div aria-hidden className={cn("rule", className)} />;
}
