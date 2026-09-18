"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LogoLockup } from "@/components/shared/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { CUT_CORNER } from "@/components/primitives/ActionLink";
import { IconArrow, IconClose, IconMenu } from "@/lib/icons";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Services", href: "/services" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Track project", href: "/track" },
  { label: "Ambassadors", href: "/apply" },
  { label: "Work with us", href: "/apply/worker" },
];

/**
 * Site header.
 *
 * At the top of the page the header has no ground and no rule — it sits
 * directly on the hero's atmosphere, which is what lets the opening
 * composition run full height. The blur and the hairline arrive only once the
 * page has moved, so the chrome earns its weight instead of asserting it.
 *
 * The previous header dropped navigation entirely below `md`. This one opens a
 * full-height index instead: escape closes it, background scroll is locked
 * while it is open, and focus returns to the trigger.
 */
export function SiteHeader() {
  const [lifted, setLifted] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();

  React.useEffect(() => {
    const onScroll = () => setLifted(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    // Captured now: by cleanup time the menu has unmounted, and reading the
    // ref then is not guaranteed to still point at the trigger.
    const opener = trigger.current;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [open]);

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-nav transition-colors duration-normal",
          lifted && "bg-background/70 backdrop-blur-xl"
        )}
      >
        {/*
          The hero's paper composition runs full height beneath this header, so
          at scroll-0 the muted nav sits on bright white sheets and drops below
          a readable contrast ratio. This is atmospheric falloff rather than a
          ground: it keeps the header weightless and lets the composition read
          through, while guaranteeing the links stay legible over whatever
          passes under them. It yields to the blur once the page lifts.
        */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-[8rem] bg-gradient-to-b from-background via-background/55 to-transparent transition-opacity duration-normal",
            lifted ? "opacity-0" : "opacity-100"
          )}
        />

        <div className="relative shell flex h-[4.5rem] items-center gap-8">
          <LogoLockup href="/" size="sm" priority />

          <nav aria-label="Primary" className="ml-auto hidden items-center gap-9 lg:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="link-underline text-[0.9375rem] text-muted-foreground transition-colors duration-fast hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-9 lg:gap-4">
            <ThemeToggle />

            <Link
              href="/login"
              className="link-underline hidden text-[0.9375rem] text-muted-foreground transition-colors duration-fast hover:text-foreground sm:block"
            >
              Sign in
            </Link>

            <Link
              href="/intake"
              className={cn(
                CUT_CORNER,
                "hidden h-10 items-center px-5 text-sm font-medium text-primary-foreground transition-colors duration-fast sm:inline-flex",
                "bg-primary hover:bg-primary-hover"
              )}
            >
              Start a project
            </Link>

            <button
              ref={trigger}
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
              aria-expanded={open}
              className="-mr-2 flex size-11 items-center justify-center text-foreground lg:hidden"
            >
              <IconMenu aria-hidden className="size-[22px]" />
            </button>
          </div>
        </div>

        {/* Hairline appears with the ground, never before it */}
        <div
          aria-hidden
          className={cn(
            "rule transition-opacity duration-normal",
            lifted ? "opacity-100" : "opacity-0"
          )}
        />
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            initial={{ opacity: 0, y: reduced ? 0 : -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : -12 }}
            transition={{ duration: reduced ? 0 : 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-modal bg-background lg:hidden"
          >
            <div className="shell flex h-[4.5rem] items-center">
              <LogoLockup href="/" size="sm" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                autoFocus
                className="-mr-2 ml-auto flex size-11 items-center justify-center text-foreground"
              >
                <IconClose aria-hidden className="size-[22px]" />
              </button>
            </div>

            <nav aria-label="Primary" className="shell mt-8">
              <ul className="index-list">
                {NAV.map((item, i) => (
                  <li key={item.href} className="border-t border-hairline/12">
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex items-baseline gap-5 py-6"
                    >
                      <span className="index-mark text-subtle">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="font-display text-[2rem] font-medium leading-none tracking-[-0.035em] text-foreground">
                        {item.label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>

              <div className="mt-12 flex flex-col gap-4">
                <Link
                  href="/intake"
                  onClick={() => setOpen(false)}
                  className={cn(
                    CUT_CORNER,
                    "inline-flex h-12 items-center justify-between bg-primary px-6 text-[0.9375rem] font-medium text-primary-foreground"
                  )}
                >
                  Start a project
                  <IconArrow aria-hidden className="size-[18px]" />
                </Link>
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="py-2 text-[0.9375rem] text-muted-foreground"
                >
                  Sign in
                </Link>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
