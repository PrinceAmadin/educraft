"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const ROTATE_MS = 3000;
const CROSSFADE_MS = 0.8;

/** Light positions for the no-samples state, cycled by cell index. */
const EMPTY_WASH = [
  "radial-gradient(120% 110% at 18% 8%, hsl(var(--primary) / 0.26), transparent 62%)",
  "radial-gradient(130% 120% at 88% 12%, hsl(var(--gold) / 0.20), transparent 60%)",
  "radial-gradient(120% 120% at 50% 100%, hsl(var(--primary) / 0.22), transparent 66%)",
  "radial-gradient(140% 110% at 8% 92%, hsl(var(--primary) / 0.18), transparent 58%)",
  "radial-gradient(120% 130% at 76% 88%, hsl(var(--gold) / 0.16), transparent 62%)",
  "radial-gradient(150% 100% at 30% 0%, hsl(var(--primary) / 0.20), transparent 64%)",
];

export interface BentoCellProps {
  title: string;
  description: string;
  href: string;
  /**
   * A rendered element, not a component. Server components cannot hand a
   * function across the client boundary — doing so hangs the prerender rather
   * than failing loudly, so the icon is created on the server and passed as a
   * node.
   */
  icon: React.ReactNode;
  /** Public URLs, already resolved on the server. May be empty. */
  images: string[];
  /** Staggers both the opening frame and the rotation phase. */
  order: number;
  /** Grid placement + minimum height, supplied by the parent. */
  className?: string;
  /** `next/image` sizes hint — cells differ a lot in rendered width. */
  sizes: string;
  /** The flagship cell sets its type a step larger. */
  emphasis?: boolean;
}

/**
 * One tile of the services bento.
 *
 * Resting state is the work itself: a rotating sample under a gradient, with
 * only the service icon showing. The name and the description are the reward
 * for engaging with it.
 *
 * Two cases override that and show the text permanently:
 *
 *   • Touch — there is no hover to give, so the copy is simply always on.
 *   • No samples yet — the folders ship empty, and six unlabelled dark
 *     rectangles is not a section. When a cell has nothing to show, the type
 *     becomes the content rather than the reveal.
 *
 * Both are handled in CSS/props rather than by sniffing the device, so a
 * hybrid laptop with a touchscreen behaves correctly at every width.
 */
export function BentoCell({
  title,
  description,
  href,
  icon,
  images,
  order,
  className,
  sizes,
  emphasis = false,
}: BentoCellProps) {
  const reduced = useReducedMotion();
  const hasImages = images.length > 0;
  const canRotate = hasImages && images.length > 1 && !reduced;

  // Each cell opens on a different frame so the grid never moves in lockstep.
  const [index, setIndex] = React.useState(() =>
    hasImages ? order % images.length : 0
  );

  React.useEffect(() => {
    if (!canRotate) return;

    let interval: number | undefined;
    // Phase-shift the first tick as well as the starting frame — otherwise
    // every cell would still turn over on the same beat.
    const kickoff = window.setTimeout(() => {
      setIndex((i) => (i + 1) % images.length);
      interval = window.setInterval(
        () => setIndex((i) => (i + 1) % images.length),
        ROTATE_MS
      );
    }, ROTATE_MS + order * 420);

    return () => {
      window.clearTimeout(kickoff);
      if (interval) window.clearInterval(interval);
    };
  }, [canRotate, images.length, order]);

  /*
    Only a cell with imagery hides its copy: the reveal trades text for a
    picture, and a cell with no picture would be trading it for nothing.
    Touch is handled by `@media (hover: none)` rather than a width breakpoint,
    so a tablet gets the always-on copy and a hybrid laptop still gets hover.
  */
  const revealOnHover = hasImages;

  return (
    <Link
      href={href}
      aria-label={`${title} — ${description}`}
      className={cn(
        "group/cell relative isolate block overflow-hidden rounded-[10px]",
        "bg-ink outline-none",
        "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
    >
      {/* ── Ground: the rotating sample ── */}
      {hasImages ? (
        <AnimatePresence initial={false}>
          <motion.div
            key={images[index]}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : CROSSFADE_MS, ease: "easeInOut" }}
            className="absolute inset-0 -z-10"
          >
            <Image
              src={images[index]}
              alt=""
              fill
              sizes={sizes}
              className="object-cover"
              priority={order === 0}
            />
          </motion.div>
        </AnimatePresence>
      ) : (
        /*
          Designed empty state. Six identical dark rectangles would read as
          missing assets, so each cell takes a different light position and
          tint from its index — the grid still looks composed until real
          samples land, and gains variation the moment they do.
        */
        <span aria-hidden className="absolute inset-0 -z-10 bg-ink">
          <span
            className="absolute inset-0"
            style={{ backgroundImage: EMPTY_WASH[order % EMPTY_WASH.length] }}
          />
          <span className="paper-lines absolute inset-0 opacity-[0.07]" />
          {/* A single rule, angled per cell, so the field has structure */}
          <span
            className="absolute inset-y-0 w-px bg-white/[0.06]"
            style={{ left: `${18 + (order % 4) * 17}%` }}
          />
        </span>
      )}

      {/* ── Overlay: ~60% at rest, ~80% engaged ──
          The samples are mostly bright document scans from mixed sources. A
          bottom-weighted gradient alone leaves their tops near-white, which
          reads as a wall of raw screenshots; a flat scrim underneath it is what
          makes six unrelated images sit together as one field. The gradient
          then does the job it is actually good at — carrying the copy. */}
      <span aria-hidden className="absolute inset-0 -z-10 bg-black/55" />
      <span
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/25 to-transparent"
      />
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 -z-10 bg-black/25 transition-opacity duration-300 ease-editorial",
          revealOnHover
            ? "opacity-0 group-hover/cell:opacity-100 group-focus-visible/cell:opacity-100 [@media(hover:none)]:opacity-100 max-sm:opacity-100"
            : "opacity-100"
        )}
      />

      {/* ── Icon: yields to the type ── */}
      <span
        aria-hidden
        className={cn(
          "absolute left-5 top-5 text-white/60 transition-opacity duration-300 ease-editorial",
          revealOnHover
            ? "group-hover/cell:opacity-0 group-focus-visible/cell:opacity-0 [@media(hover:none)]:opacity-0 max-sm:opacity-0"
            : "opacity-0"
        )}
      >
        {icon}
      </span>

      {/* ── Copy ── */}
      <div className="relative flex h-full flex-col justify-end p-5 md:p-7">
        <div
          className={cn(
            "transition-[transform,opacity] duration-300 ease-editorial",
            revealOnHover
              ? [
                  "translate-y-3 opacity-0",
                  "group-hover/cell:translate-y-0 group-hover/cell:opacity-100",
                  "group-focus-visible/cell:translate-y-0 group-focus-visible/cell:opacity-100",
                  "[@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100",
                  "max-sm:translate-y-0 max-sm:opacity-100",
                ].join(" ")
              : "translate-y-0 opacity-100"
          )}
        >
          <h3
            className={cn(
              "font-display font-semibold leading-[1.05] tracking-[-0.03em] text-white",
              emphasis
                ? "text-[clamp(1.5rem,2.6vw,2.5rem)]"
                : "text-[clamp(1.125rem,1.6vw,1.5rem)]"
            )}
          >
            {title}
          </h3>

          <p
            className={cn(
              "mt-2 max-w-[38ch] text-[0.8125rem] leading-relaxed text-white/70 md:text-[0.875rem]",
              "transition-opacity duration-300 ease-editorial",
              // Trails the title by 100ms — but only when it is actually revealed.
              revealOnHover
                ? [
                    "opacity-0 delay-100",
                    "group-hover/cell:opacity-100 group-focus-visible/cell:opacity-100",
                    "[@media(hover:none)]:opacity-100 [@media(hover:none)]:delay-0",
                    "max-sm:opacity-100 max-sm:delay-0",
                  ].join(" ")
                : "opacity-100"
            )}
          >
            {description}
          </p>
        </div>
      </div>
    </Link>
  );
}
