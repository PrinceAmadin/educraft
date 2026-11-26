"use client";

import * as React from "react";
import Link from "next/link";
import { CUT_CORNER } from "@/components/primitives/ActionLink";
import { cn } from "@/lib/utils";

/**
 * The apply bar that follows the visitor down the page.
 *
 * Most people who apply do so after reading what it pays, which is a long way
 * from the button at the top — so the button has to come with them. It appears
 * once the hero's own button has scrolled away and leaves again before the
 * closing one, so there are never two competing buttons on screen.
 *
 * Driven by an IntersectionObserver on two sentinels rather than a scroll
 * handler: no work on the frames where neither boundary was crossed.
 */
export function StickyApply({ href, label, note }: { href: string; label: string; note?: string }) {
  const [show, setShow] = React.useState(false);

  React.useEffect(() => {
    const hero = document.getElementById("join-cta-sentinel");
    const close = document.getElementById("join-close-sentinel");
    if (!hero) return;

    let pastHero = false;
    let atClose = false;
    const apply = () => setShow(pastHero && !atClose);

    const heroWatch = new IntersectionObserver(
      ([entry]) => {
        pastHero = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        apply();
      },
      { threshold: 0 }
    );
    heroWatch.observe(hero);

    const closeWatch = close
      ? new IntersectionObserver(
          ([entry]) => {
            atClose = entry.isIntersecting;
            apply();
          },
          { threshold: 0 }
        )
      : null;
    if (close && closeWatch) closeWatch.observe(close);

    return () => {
      heroWatch.disconnect();
      closeWatch?.disconnect();
    };
  }, []);

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-hairline/15 bg-background/95 backdrop-blur-md transition-transform duration-300",
        show ? "translate-y-0" : "translate-y-full"
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-hidden={!show}
    >
      <div className="shell flex items-center justify-between gap-4 py-3">
        {note ? <p className="meta-label hidden text-muted-foreground sm:block">{note}</p> : <span />}
        <Link
          href={href}
          tabIndex={show ? 0 : -1}
          className={cn(
            CUT_CORNER,
            "inline-flex h-12 w-full items-center justify-center gap-2 bg-primary px-6 text-[0.9375rem] font-medium text-primary-foreground transition-colors hover:bg-primary-hover sm:w-auto"
          )}
        >
          {label}
        </Link>
      </div>
    </div>
  );
}
