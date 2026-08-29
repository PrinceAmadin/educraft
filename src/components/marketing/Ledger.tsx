import * as React from "react";
import { Reveal } from "@/components/primitives/Reveal";
import { CountUp } from "@/components/marketing/CountUp";
import { LEDGER } from "@/lib/marketing";
import { cn } from "@/lib/utils";

/**
 * Editorial data index.
 *
 * Four numbers, not four tiles. The lead figure is set three steps larger than
 * the rest because it is the more interesting claim — equal weight would say
 * they matter equally, which is a design decision nobody made on purpose.
 *
 * Each figure counts up the first time the band enters view, staggered by
 * 100ms so the row resolves left to right rather than snapping at once.
 *
 * Separation comes from hairlines and baseline alignment. There is no
 * container, and the row is deliberately the quietest band on the page: it sits
 * between the hero and the catalogue as a breath, not as a feature.
 */
export function Ledger() {
  const [lead, ...support] = LEDGER;

  return (
    <section
      aria-label="EduCraft by the numbers"
      className="relative bg-background"
    >
      <div className="shell">
        <div className="rule" />
        <div className="grid-12 py-[clamp(2.75rem,6vh,4.5rem)]">
          <Reveal className="col-span-4 md:col-span-5">
            <p className="index-mark text-subtle">{lead.label.toUpperCase()}</p>
            <p className="mt-3 font-display text-stat font-semibold tracking-tight text-foreground">
              <CountUp
                to={lead.to}
                decimals={lead.decimals}
                prefix={lead.prefix}
                suffix={lead.suffix}
                duration={1.7}
              />
            </p>
          </Reveal>

          <div className="col-span-4 mt-10 grid grid-cols-3 md:col-span-7 md:mt-0 md:self-end">
            {support.map((entry, i) => (
              <Reveal
                key={entry.label}
                delay={90 + i * 70}
                className={cn(
                  "relative pl-4 md:pl-7",
                  // A hairline opens each entry, except the first in the row on
                  // mobile where it would read as a stray mark.
                  i > 0 &&
                    "before:absolute before:inset-y-1 before:left-0 before:w-px before:bg-hairline/12",
                  i === 0 &&
                    "md:before:absolute md:before:inset-y-1 md:before:left-0 md:before:w-px md:before:bg-hairline/12"
                )}
              >
                <p className="font-display text-[clamp(1.5rem,2.6vw,2.25rem)] font-semibold leading-none tracking-tight text-foreground">
                  <CountUp
                    to={entry.to}
                    decimals={entry.decimals}
                    prefix={entry.prefix}
                    suffix={entry.suffix}
                    duration={1.4}
                    delay={0.1 * (i + 1)}
                  />
                </p>
                <p className="mt-2.5 text-xs leading-snug text-subtle md:text-[0.8125rem]">
                  {entry.label}
                </p>
              </Reveal>
            ))}
          </div>
        </div>
        <div className="rule" />
      </div>
    </section>
  );
}
