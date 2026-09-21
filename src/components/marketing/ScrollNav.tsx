"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { IconChevronsDown, IconChevronsUp } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * Page-end controls.
 *
 * Two borderless double chevrons with a soft teal glow — no container, no
 * border, no page counter, no section stepping. Up goes to the top of the page
 * and down goes to the very bottom; that is the whole job.
 *
 * The glyph stays small but each control owns a 44×44 hit area. On phones the
 * pair sits low on the right, clear of the reading column; from md up it
 * centres on the right edge.
 *
 * Rendered only when the page is long enough to need it, and each control is
 * disabled at the end it would take you to. Smooth scrolling is skipped under
 * `prefers-reduced-motion` — the jump still happens, instantly.
 */
export function ScrollNav() {
  const reduced = useReducedMotion();
  // Forms have their own sticky action bar; the controls would sit on top of it.
  const onForm = /^\/(apply|intake|probono|services)(\/|$)/.test(usePathname() ?? "");
  const [state, setState] = React.useState({ needed: false, atTop: true, atBottom: false });

  React.useEffect(() => {
    let frame = 0;

    const measure = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const y = window.scrollY;
      setState({
        needed: max > window.innerHeight * 0.75,
        atTop: y < 48,
        atBottom: y > max - 48,
      });
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // Content grows after hydration (images, client-rendered lists), which
    // changes whether the page is long enough to need the controls at all.
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
    };
  }, []);

  if (!state.needed || onForm) return null;

  const go = (top: number) => window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });

  return (
    <nav
      aria-label="Page scroll"
      className={cn(
        "fixed z-nav flex flex-col gap-1",
        "bottom-[max(1rem,env(safe-area-inset-bottom))] right-1.5 sm:right-3",
        // On phones the pair floats over right-aligned prices and links as the
        // page scrolls, so it carries a soft page-coloured backing (still no
        // border). From md it sits in the empty right margin and needs none.
        "rounded-full bg-background/80 backdrop-blur-sm",
        "md:bottom-auto md:right-5 md:top-1/2 md:-translate-y-1/2 md:gap-3 md:bg-transparent md:backdrop-blur-none lg:right-6"
      )}
    >
      <ScrollControl
        direction="up"
        label="Scroll to top"
        disabled={state.atTop}
        onClick={() => go(0)}
      />
      <ScrollControl
        direction="down"
        label="Scroll to bottom"
        disabled={state.atBottom}
        onClick={() => go(document.documentElement.scrollHeight)}
      />
    </nav>
  );
}

function ScrollControl({
  direction,
  label,
  disabled,
  onClick,
}: {
  direction: "up" | "down";
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "up" ? IconChevronsUp : IconChevronsDown;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "group/scroll flex size-11 items-center justify-center rounded-full text-primary outline-none",
        "[filter:drop-shadow(0_0_12px_rgb(13_148_136/0.35))]",
        "transition-[filter,opacity] duration-200 ease-out",
        "hover:[filter:drop-shadow(0_0_20px_rgb(13_148_136/0.55))]",
        "focus-visible:[filter:drop-shadow(0_0_20px_rgb(13_148_136/0.55))]",
        "disabled:pointer-events-none disabled:opacity-25"
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "size-5 transition-transform duration-200 ease-out md:size-[22px]",
          direction === "up"
            ? "group-hover/scroll:-translate-y-0.5"
            : "group-hover/scroll:translate-y-0.5"
        )}
      />
    </button>
  );
}
