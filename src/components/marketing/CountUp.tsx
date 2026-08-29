"use client";

import * as React from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";

/**
 * A figure that counts up once, when it first enters the viewport.
 *
 * Eased rather than linear — `easeOut` puts most of the travel in the first
 * third, so the number reads as arriving at a value instead of ticking like a
 * stopwatch. It runs once and never re-fires on scroll-back.
 *
 * The final value is present in the DOM from the first render and the counting
 * digits are `aria-hidden`, so assistive tech and search engines always read
 * "90+", never a partial number mid-animation.
 */
export function CountUp({
  to,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 1.5,
  delay = 0,
  className,
}: {
  to: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  delay?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -15% 0px" });
  const reduced = useReducedMotion();

  const format = React.useCallback(
    (v: number) =>
      `${prefix}${v.toLocaleString("en-NG", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}${suffix}`,
    [prefix, suffix, decimals]
  );

  const [display, setDisplay] = React.useState(() => (reduced ? format(to) : format(0)));

  React.useEffect(() => {
    if (!inView) return;

    if (reduced) {
      setDisplay(format(to));
      return;
    }

    const controls = animate(0, to, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(format(v)),
    });

    return () => controls.stop();
  }, [inView, to, duration, delay, reduced, format]);

  return (
    <span ref={ref} className={className}>
      <span aria-hidden>{display}</span>
      <span className="sr-only">{format(to)}</span>
    </span>
  );
}
