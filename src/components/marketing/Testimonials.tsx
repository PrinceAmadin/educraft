"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Voice = {
  quote: string;
  /** The clause set in serif italic — one per quote, no more. */
  emphasis: string;
  name: string;
  university: string;
  programme: string;
};

const VOICES: Voice[] = [
  {
    quote:
      "I had been dodging my supervisor for weeks because Chapter Four was nowhere. They asked for my questionnaire data, ran the analysis properly, and the tables actually matched what I collected.",
    emphasis: "the tables actually matched what I collected",
    name: "Chinaza Okeke",
    university: "University of Nigeria, Nsukka",
    programme: "B.Sc. Sociology",
  },
  {
    quote:
      "What convinced me was that they asked about my department's format guide before writing a single page. Nobody else asked. My defence had no formatting queries at all.",
    emphasis: "Nobody else asked.",
    name: "Ibrahim Sanni",
    university: "Ahmadu Bello University",
    programme: "B.Eng. Electrical Engineering",
  },
  {
    quote:
      "I paid 45% and honestly expected to be chasing someone. Instead I got a project ID, a timeline, and a message every time something moved. The balance felt easy to pay.",
    emphasis: "a project ID, a timeline",
    name: "Blessing Ediale",
    university: "University of Benin",
    programme: "B.Sc. Accounting",
  },
];

/** Splits a quote so one clause can carry the serif emphasis. */
function withEmphasis(quote: string, emphasis: string) {
  const at = quote.indexOf(emphasis);
  if (at < 0) return [quote, "", ""] as const;
  return [quote.slice(0, at), emphasis, quote.slice(at + emphasis.length)] as const;
}

export function Testimonials() {
  const [active, setActive] = React.useState(0);
  const voice = VOICES[active];
  const [before, mid, after] = withEmphasis(voice.quote, voice.emphasis);

  return (
    <div className="grid-12 items-start gap-y-14">
      {/* ── The quote ─────────────────────────────────────── */}
      <figure className="col-span-4 md:col-span-8 md:col-start-1 lg:col-span-7">
        <span aria-hidden className="accent-serif block text-[64px] leading-[0.5] text-primary/40">
          &ldquo;
        </span>

        {/* aria-live so the change is announced when the reader switches voice */}
        <blockquote
          aria-live="polite"
          className="mt-7 text-[clamp(1.375rem,2.9vw,2.3rem)] font-light leading-[1.32] tracking-[-0.025em] text-foreground"
        >
          <p key={active} className="text-balance">
            {before}
            <em className="accent-serif text-primary">{mid}</em>
            {after}
          </p>
        </blockquote>

        <figcaption className="mt-9 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-[15px] font-medium tracking-tight text-foreground">
            {voice.name}
          </span>
          <span className="h-3 w-px bg-hairline/25" />
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-subtle">
            {voice.university}
          </span>
          <span className="h-3 w-px bg-hairline/25" />
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-subtle">
            {voice.programme}
          </span>
        </figcaption>
      </figure>

      {/* ── The index of other voices ─────────────────────── */}
      <div
        role="group"
        aria-label="Choose a student account to read"
        className="col-span-4 md:col-span-4 md:col-start-9 lg:col-span-3 lg:col-start-10"
      >
        <p className="eyebrow mb-2">More accounts</p>

        {VOICES.map((v, i) => {
          const selected = i === active;
          return (
            <React.Fragment key={v.name}>
              <div className="rule" />
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => setActive(i)}
                className="group relative flex w-full items-baseline gap-3.5 py-4 text-left outline-none"
              >
                {/* Selected marker: a teal rule in the margin, not a filled chip */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute -left-3 top-1/2 h-6 w-px -translate-y-1/2 origin-center bg-primary transition-transform duration-400 ease-editorial",
                    selected ? "scale-y-100" : "scale-y-0"
                  )}
                />
                <span
                  className={cn(
                    "index-mark shrink-0 transition-colors duration-300",
                    selected ? "text-primary" : "text-subtle"
                  )}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block text-[14.5px] tracking-tight transition-colors duration-300",
                      selected
                        ? "text-foreground"
                        : "text-muted-foreground group-hover:text-foreground"
                    )}
                  >
                    {v.name}
                  </span>
                  <span className="mt-1 block truncate font-mono text-[10.5px] uppercase tracking-[0.14em] text-subtle">
                    {v.university}
                  </span>
                </span>
              </button>
            </React.Fragment>
          );
        })}
        <div className="rule" />
      </div>
    </div>
  );
}
