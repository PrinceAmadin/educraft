"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Scroll reveal.
 *
 * Motion is described in CSS (`[data-reveal]` in globals.css); this component
 * only decides *when* an element crosses into view. Keeping the animation in
 * CSS means reduced-motion users get the final state with no JS branch, and a
 * single observer per element replaces a scroll handler.
 *
 * Variants exist because a uniform fade-up on every section is the single
 * clearest tell of a generated page:
 *   rise          general content
 *   wipe          statement type — clips up from its own baseline
 *   in-from-left  catalogue rows, matching reading direction
 *
 * If JS never arrives, the `<noscript>` override in the public layout drops
 * every element back to its shown state, so the page is never blank.
 */

type RevealVariant = "rise" | "wipe" | "in-from-left";

interface RevealProps extends React.HTMLAttributes<HTMLElement> {
  as?: React.ElementType;
  /** Stagger, in ms. Applied as a CSS custom property, not a timer. */
  delay?: number;
  variant?: RevealVariant;
  /** How far into the viewport the element must travel before it fires. */
  margin?: string;
}

export function Reveal({
  as: Tag = "div",
  delay = 0,
  variant = "rise",
  margin = "0px 0px -12% 0px",
  className,
  style,
  children,
  ...rest
}: RevealProps) {
  const ref = React.useRef<HTMLElement | null>(null);
  const [shown, setShown] = React.useState(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node || shown) return;

    // Honour the OS setting here as well as in CSS: with reduced motion there
    // is no reason to keep an observer alive for the life of the page.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: margin, threshold: 0.01 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [margin, shown]);

  const revealDelay = { "--reveal-delay": `${delay}ms` } as React.CSSProperties;

  /**
   * The `wipe` variant clips the pending element to zero height. An
   * IntersectionObserver measures the target's *clipped* box, so observing the
   * clipped element itself is a deadlock: it can never report as intersecting,
   * `shown` never flips, and the content stays hidden for the life of the page.
   *
   * So for `wipe` only, the observed node and the animated node are different
   * elements — the outer element is never clipped and is what we watch. Other
   * variants animate opacity/transform, which the observer ignores, and keep
   * the single-element structure (`as="li"` call sites depend on it).
   */
  if (variant === "wipe") {
    return (
      <Tag ref={ref} className={cn(className)} style={style} {...rest}>
        <div data-reveal={shown ? "shown" : "pending"} data-reveal-variant="wipe" style={revealDelay}>
          {children}
        </div>
      </Tag>
    );
  }

  return (
    <Tag
      ref={ref}
      data-reveal={shown ? "shown" : "pending"}
      data-reveal-variant={variant}
      style={{ ...style, ...revealDelay }}
      className={cn(className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}
