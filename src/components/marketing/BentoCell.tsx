"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CvCarousel } from "@/components/marketing/CvCarousel";
import { cn } from "@/lib/utils";

const ROTATE_MS = 3000;
const CROSSFADE_MS = 0.8;

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
  /**
   * How the samples are shown.
   *   photo — full-bleed rotating sample under a scrim, copy revealed on hover
   *   cv    — CV pages fanned on the same deep teal field as the photo tiles;
   *           copy always visible beside them
   */
  media?: "photo" | "cv";
}

/**
 * One tile of the services bento.
 *
 * Every tile sits on the warm paper colour (#F5F5F0), never black — that is
 * what shows while an image loads, and what an empty folder falls back to.
 *
 *   • Photo tiles: the work itself under a scrim, with the name and
 *     description as the reward for hovering. Touch shows the copy always.
 *   • CV tile: CV samples are pages, not photographs, so they sit on paper in
 *     a slow carousel with the copy beside them.
 *   • No samples yet: a paper tile with the service icon centred and the copy
 *     always on — a designed placeholder, not a missing asset.
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
  media = "photo",
}: BentoCellProps) {
  const reduced = useReducedMotion();
  const hasImages = images.length > 0;
  const mode: "photo" | "cv" | "empty" = !hasImages ? "empty" : media;
  const canRotate = mode === "photo" && images.length > 1 && !reduced;

  // Each cell opens on a different frame so the grid never moves in lockstep.
  const [index, setIndex] = React.useState(() => (hasImages ? order % images.length : 0));

  React.useEffect(() => {
    if (!canRotate) return;

    let interval: number | undefined;
    // Phase-shift the first tick as well as the starting frame — otherwise
    // every cell would still turn over on the same beat.
    const kickoff = window.setTimeout(() => {
      setIndex((i) => (i + 1) % images.length);
      interval = window.setInterval(() => setIndex((i) => (i + 1) % images.length), ROTATE_MS);
    }, ROTATE_MS + order * 420);

    return () => {
      window.clearTimeout(kickoff);
      if (interval) window.clearInterval(interval);
    };
  }, [canRotate, images.length, order]);

  // Only a photo tile hides its copy — the reveal trades text for a picture.
  const revealOnHover = mode === "photo";
  const onPaper = mode === "empty";

  return (
    <Link
      href={href}
      aria-label={`${title} — ${description}`}
      className={cn(
        "group/cell relative isolate block overflow-hidden rounded-2xl bg-[#10262b] outline-none",
        "shadow-[0_1px_2px_rgb(15_23_42/0.1),0_18px_36px_-18px_rgb(15_23_42/0.5),0_0_0_1px_rgb(15_23_42/0.08)]",
        "transition-[transform,box-shadow] duration-300 ease-editorial hover:-translate-y-0.5 active:scale-[0.99]",
        "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
    >
      {/* ── Ground ── */}
      {mode === "photo" ? (
        <>
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

          {/* Scrim — bright document scans from mixed sources need a flat wash
              to sit together as one field; the gradient then carries the copy. */}
          {/* The top of the tile shows the work nearly untouched; the foot
              deepens into the brand's dark teal where the copy sits. */}
          <span
            aria-hidden
            className="absolute inset-0 -z-10 bg-gradient-to-t from-[#06171a]/90 from-0% via-[#06171a]/60 via-30% to-transparent to-62%"
          />
          <span
            aria-hidden
            className={cn(
              "absolute inset-0 -z-10 bg-[#06171a]/15 opacity-0 transition-opacity duration-300 ease-editorial",
              "[@media(hover:hover)]:group-hover/cell:opacity-100 group-focus-visible/cell:opacity-100"
            )}
          />
        </>
      ) : null}

      {mode === "cv" ? (
        <>
          {/* Same deep teal field as the photo tiles, lit from the CV side */}
          <span
            aria-hidden
            className="absolute inset-0 -z-10 bg-[radial-gradient(80%_90%_at_78%_50%,hsl(var(--primary)/0.32),transparent_70%),linear-gradient(135deg,#0e2a2f,#08171a)]"
          />
          <div className="absolute inset-y-0 right-0 -z-10 w-[62%] sm:w-[58%]">
            <CvCarousel images={images} />
          </div>
          {/* Keeps the copy clear of the fanned pages */}
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 -z-10 w-[62%] bg-gradient-to-r from-[#08171a] via-[#08171a]/80 to-transparent"
          />
        </>
      ) : null}

      {mode === "empty" ? (
        <span
          aria-hidden
          className="absolute inset-0 -z-10 flex items-center justify-center text-paper-muted/50 [&_svg]:size-10"
        >
          {icon}
        </span>
      ) : null}

      {/* ── Icon: on photo tiles it yields to the type ── */}
      {mode === "photo" ? (
        <span
          aria-hidden
          className="absolute left-5 top-5 text-white/70 transition-opacity duration-300 ease-editorial group-hover/cell:opacity-0 group-focus-visible/cell:opacity-0 max-sm:opacity-0 [@media(hover:none)]:opacity-0"
        >
          {icon}
        </span>
      ) : null}

      {/* ── Copy ── */}
      <div className={cn("relative flex h-full flex-col justify-end p-5 md:p-7", mode === "cv" && "max-w-[46%] md:pr-2")}>
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
              "font-display font-semibold leading-[1.05] tracking-[-0.03em]",
              onPaper ? "text-paper-ink" : "text-white [text-shadow:0_1px_12px_rgb(0_0_0/0.45)]",
              emphasis ? "text-[clamp(1.5rem,2.6vw,2.5rem)]" : "text-[clamp(1.125rem,1.6vw,1.5rem)]"
            )}
          >
            {title}
          </h3>

          <p
            className={cn(
              "mt-2 max-w-[38ch] text-[0.8125rem] leading-relaxed md:text-[0.875rem]",
              onPaper ? "text-paper-muted" : "text-white/75",
              "transition-opacity duration-300 ease-editorial",
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
