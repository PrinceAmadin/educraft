"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { IconChevronDown, IconChevronUp } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * Section-to-section wayfinding.
 *
 * Sections are read from the DOM (`main > section`) rather than from a hard
 * coded list of ids — the page's composition changes often, and a list that
 * has to be kept in step with it is a list that will silently fall out of step.
 *
 * Appears once the reader has committed to the page (past the first viewport)
 * so it never competes with the hero. Ends are honest: the up control is
 * disabled at the top and the down control at the last section, rather than
 * looping the reader around without warning.
 *
 * Smooth scrolling is skipped under `prefers-reduced-motion` — the jump still
 * happens, it just happens instantly.
 */
export function ScrollNav() {
  const [sections, setSections] = React.useState<HTMLElement[]>([]);
  const [current, setCurrent] = React.useState(0);
  const [visible, setVisible] = React.useState(false);
  const reduced = useReducedMotion();

  React.useEffect(() => {
    const found = Array.from(
      document.querySelectorAll<HTMLElement>("main > section")
    );
    setSections(found);
    if (!found.length) return;

    // Whichever section owns the top third of the viewport is "current".
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const i = found.indexOf(entry.target as HTMLElement);
          if (i >= 0) setCurrent(i);
        }
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 }
    );
    found.forEach((s) => observer.observe(s));

    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const goTo = (index: number) => {
    const target = sections[index];
    if (!target) return;
    target.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "start",
    });
  };

  const atStart = current <= 0;
  const atEnd = current >= sections.length - 1;

  if (sections.length < 2) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.nav
          aria-label="Section navigation"
          initial={reduced ? false : { opacity: 0, y: 12, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduced ? undefined : { opacity: 0, y: 12, scale: 0.94 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className={cn(
            "fixed z-nav flex flex-col gap-px",
            "bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[clamp(1rem,3vw,2.25rem)]"
          )}
        >
          <ScrollButton
            label="Previous section"
            disabled={atStart}
            onClick={() => goTo(current - 1)}
          >
            <IconChevronUp aria-hidden className="size-[18px]" />
          </ScrollButton>

          {/* Position readout — doubles as the seam between the two controls */}
          <p
            aria-hidden
            className="tabular bg-card/80 px-2 py-1 text-center text-[10px] font-medium text-subtle backdrop-blur-md"
          >
            {String(current + 1).padStart(2, "0")}
          </p>

          <ScrollButton
            label="Next section"
            disabled={atEnd}
            onClick={() => goTo(current + 1)}
          >
            <IconChevronDown aria-hidden className="size-[18px]" />
          </ScrollButton>
        </motion.nav>
      )}
    </AnimatePresence>
  );
}

function ScrollButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "group/scroll relative flex size-10 items-center justify-center",
        "bg-card/80 text-muted-foreground backdrop-blur-md",
        "ring-1 ring-inset ring-hairline/15 transition-colors duration-fast",
        "hover:text-primary hover:ring-primary/40",
        "focus-visible:text-primary focus-visible:ring-primary",
        "disabled:pointer-events-none disabled:opacity-35"
      )}
    >
      {/* Restrained glow — a ring that blooms once on hover, no pulsing */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 scale-90 bg-primary/12 opacity-0 transition-[opacity,transform] duration-normal ease-editorial group-hover/scroll:scale-100 group-hover/scroll:opacity-100"
      />
      <span className="relative transition-transform duration-fast ease-editorial group-hover/scroll:translate-y-px">
        {children}
      </span>
    </button>
  );
}
