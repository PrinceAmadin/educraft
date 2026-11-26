import * as React from "react";
import { Reveal } from "@/components/primitives/Reveal";
import { CountUp } from "@/components/marketing/CountUp";
import type { MarketingStat } from "@/lib/services/marketing-stats";
import { cn } from "@/lib/utils";

/**
 * Editorial data index.
 *
 * Numbers, not tiles. The lead figure is set three steps larger than the rest
 * because it is the more interesting claim — equal weight would say they
 * matter equally, which is a design decision nobody made on purpose.
 *
 * Each figure counts up the first time the band enters view, staggered so the
 * row resolves left to right rather than snapping at once. Separation comes
 * from hairlines and baseline alignment: there is no container, and the row is
 * deliberately the quietest band on the page.
 *
 * The figures arrive as a prop and are computed or stated per request — see
 * `services/marketing-stats.ts`. They used to be four constants in a source
 * file, which is how the page came to claim a 95% delivery record and a 4.5
 * rating that HQ had no record of and no rating system for.
 *
 * It renders whatever it is given, from one figure to four, and nothing at all
 * when it is given nothing — every stat can drop itself when it is too small
 * to be worth stating, and an absent band is better than a padded one.
 */
export function Ledger({ stats }: { stats: MarketingStat[] }) {
  if (stats.length === 0) return null;

  const [lead, ...support] = stats;

  return (
    <section aria-label="EduCraft by the numbers" className="relative ground-b">
      <div className="shell">
        <div className="grid-12 py-[clamp(2.75rem,6vh,4.5rem)]">
          <Reveal className="col-span-4 md:col-span-5">
            <p className="index-mark text-subtle">{lead.label.toUpperCase()}</p>
            <p className="mt-3 font-display text-stat font-semibold tracking-tight text-foreground">
              <CountUp to={lead.to} suffix={lead.suffix} duration={1.7} />
            </p>
          </Reveal>

          {support.length > 0 ? (
            <div
              className={cn(
                "col-span-4 mt-10 grid md:col-span-7 md:mt-0 md:self-end",
                // Columns follow the count, so two figures are not left
                // huddled in the first third of a three-column grid.
                support.length === 1 && "grid-cols-1",
                support.length === 2 && "grid-cols-2",
                support.length >= 3 && "grid-cols-3"
              )}
            >
              {support.map((entry, i) => (
                <Reveal
                  key={entry.label}
                  delay={90 + i * 70}
                  className={cn(
                    "relative",
                    // A hairline opens each entry, except the first in the row
                    // on mobile where it would read as a stray mark.
                    i > 0 && "pl-4 md:pl-7",
                    i > 0 &&
                      "before:absolute before:inset-y-1 before:left-0 before:w-px before:bg-hairline/12",
                    i === 0 &&
                      "md:pl-7 md:before:absolute md:before:inset-y-1 md:before:left-0 md:before:w-px md:before:bg-hairline/12"
                  )}
                >
                  <p className="font-display text-[clamp(1.5rem,2.6vw,2.25rem)] font-semibold leading-none tracking-tight text-foreground">
                    <CountUp to={entry.to} suffix={entry.suffix} duration={1.4} delay={0.1 * (i + 1)} />
                  </p>
                  <p className="mt-2.5 text-xs leading-snug text-subtle md:text-[0.8125rem]">{entry.label}</p>
                </Reveal>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
