"use client";

import * as React from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import type { Block } from "@/lib/document-content";
import { cn } from "@/lib/utils";

/**
 * Typeset page content for the paper mock-ups.
 *
 * Set at fractional `em` sizes against a container-relative root so the page
 * scales with the sheet instead of needing a breakpoint per size. Chapter
 * openers and section numbers take the brand teal; body copy stays in paper
 * ink, the way a real printed page reads.
 */
export function Blocks({ blocks, dense = false }: { blocks: Block[]; dense?: boolean }) {
  return (
    <div className={cn("space-y-[0.9em]", dense && "space-y-[0.7em]")}>
      {blocks.map((block, i) => {
        switch (block.kind) {
          case "chapter":
            return (
              <div key={i} className="pt-[0.4em]">
                <p className="font-display text-[1.5em] font-semibold leading-none tracking-tight text-primary">
                  {block.label}
                </p>
                <p className="mt-[0.35em] text-[1.05em] leading-none text-paper-muted">
                  {block.title}
                </p>
              </div>
            );

          case "heading":
            return (
              <p
                key={i}
                className="pt-[0.3em] font-mono text-[0.82em] font-semibold uppercase tracking-[0.1em] text-primary/85"
              >
                {block.text}
              </p>
            );

          case "prose":
            return (
              <p
                key={i}
                className="text-[0.8em] leading-[1.75] text-paper-ink/70 [text-align:justify] [hyphens:auto]"
              >
                {block.text}
              </p>
            );

          case "figure":
            return (
              <div key={i} className="pt-[0.3em]">
                <div className="flex h-[4.5em] w-[70%] items-end gap-[0.35em]">
                  {block.bars.map((v, bi) => (
                    <span
                      key={bi}
                      style={{ height: `${v}%` }}
                      className={cn(
                        "flex-1",
                        bi === block.bars.length - 1 ? "bg-primary" : "bg-paper-ink/20"
                      )}
                    />
                  ))}
                </div>
                <div className="h-px w-[70%] bg-paper-ink/25" />
                <p className="mt-[0.5em] font-mono text-[0.68em] font-medium tracking-[0.08em] text-paper-muted">
                  {block.caption}
                </p>
              </div>
            );

          case "reference":
            return (
              <p
                key={i}
                className="pl-[1.2em] -indent-[1.2em] text-[0.75em] leading-[1.6] text-paper-ink/60"
              >
                <span className="text-paper-ink/80">{block.author}</span> {block.rest}
              </p>
            );

          case "rule":
            return <div key={i} className="h-px bg-paper-ink/15" />;

          default:
            return null;
        }
      })}
    </div>
  );
}

/**
 * A page whose text travels as the reader scrolls the hero.
 *
 * The sheet is a fixed frame; the type inside it moves. That is what makes the
 * stack read as live work rather than as a screenshot — the documents are
 * being written while you look at them.
 *
 * `distance` is a percentage of the column's own height, so a longer page
 * travels further and every sheet finishes its run at the same moment.
 */
export function ScrollingPage({
  blocks,
  distance = 42,
  className,
  fontSize = "0.5rem",
  dense,
}: {
  blocks: Block[];
  distance?: number;
  className?: string;
  /** Root size for the page's em-based scale. */
  fontSize?: string;
  dense?: boolean;
}) {
  const frame = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: frame,
    offset: ["start end", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], ["0%", `-${distance}%`]);

  return (
    <div ref={frame} className={cn("relative h-full overflow-hidden", className)}>
      <motion.div style={{ fontSize, y: reduced ? "0%" : y }} className="will-change-transform">
        <Blocks blocks={blocks} dense={dense} />
      </motion.div>

      {/* The type runs under the page edges rather than stopping at them */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[18%] bg-gradient-to-t from-paper to-transparent"
      />
    </div>
  );
}
