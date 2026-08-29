import { cn } from "@/lib/utils";

const CHECKS = [
  { n: "01", label: "Structure & chapter completeness" },
  { n: "02", label: "References cross-checked against citations" },
  { n: "03", label: "Referencing style applied consistently" },
  { n: "04", label: "Department format & page requirements" },
  { n: "05", label: "Figures, tables and appendices labelled" },
  { n: "06", label: "Originality and language review" },
];

/**
 * A marked-up page: the document sits centre, the rubric hangs in the margins
 * on desktop and falls into an ordered list on mobile. Connector rules, not
 * boxes — the annotation convention of a supervisor's red pen.
 */
export function QualityAnnotations({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.82fr)] lg:items-center lg:gap-x-16",
        className
      )}
    >
      {/* ── The page under review ─────────────────────────── */}
      <div className="relative z-10 mx-auto w-full max-w-[380px] lg:mx-0 lg:max-w-[420px]">
        <article className="paper-surface relative rounded-[3px] px-7 py-8 sm:px-9 sm:py-10">
          <header className="flex items-baseline justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-paper-muted">
            <span>Chapter Two</span>
            <span>Literature Review</span>
          </header>

          <p className="mt-5 text-[17px] font-semibold leading-[1.25] tracking-[-0.02em] text-paper-ink">
            2.3 Theoretical Framework
          </p>

          <div className="mt-4 space-y-[7px]">
            {[100, 97, 92, 99, 86].map((w, i) => (
              <div
                key={i}
                style={{ width: `${w}%` }}
                className="h-[5px] rounded-[1px] bg-paper-ink/[0.13]"
              />
            ))}
          </div>

          {/* A cited passage — the thing being checked */}
          <blockquote className="relative mt-5 pl-4">
            <span className="absolute left-0 top-0 h-full w-px bg-primary/70" />
            <p className="text-[11.5px] leading-[1.6] text-paper-ink/75">
              &ldquo;Membrane distillation offers a viable low-energy pathway for
              decentralised purification in off-grid communities.&rdquo;
            </p>
            <cite className="mt-2 block font-mono text-[9px] not-italic tracking-[0.06em] text-paper-muted">
              (Adeyemi, 2023, p. 47)
            </cite>
          </blockquote>

          <div className="mt-5 space-y-[7px]">
            {[95, 100, 78].map((w, i) => (
              <div
                key={i}
                style={{ width: `${w}%` }}
                className="h-[5px] rounded-[1px] bg-paper-ink/[0.13]"
              />
            ))}
          </div>

          <footer className="mt-7 flex items-baseline justify-between font-mono text-[9px] tracking-[0.12em] text-paper-muted">
            <span>APA 7th</span>
            <span className="tabular-nums">24</span>
          </footer>

          {/* Reviewer's marks in the margin — gold, sparing */}
          <span
            aria-hidden
            className="absolute -right-3 top-[38%] hidden items-center gap-2 lg:flex"
          >
            <span className="accent-serif whitespace-nowrap text-[13px] text-gold">
              cite checked
            </span>
            <span className="h-px w-5 bg-gold/50" />
          </span>
        </article>
      </div>

      {/* ── Rubric: margin annotations on desktop ─────────── */}
      <ol className="mt-12 lg:mt-0 lg:space-y-1">
        {CHECKS.map((check, i) => (
          <li
            key={check.n}
            className={cn(
              "group flex items-baseline gap-4 py-3",
              // Stagger the margin notes so they read as annotations, not a list
              i % 2 === 1 && "lg:translate-x-6"
            )}
          >
            {/* Connector rule back toward the page */}
            <span
              aria-hidden
              className="hidden h-px w-6 shrink-0 translate-y-[-4px] bg-hairline/25 transition-all duration-400 ease-editorial group-hover:w-10 group-hover:bg-primary/70 lg:block"
            />
            <span className="index-mark shrink-0 text-primary">{check.n}</span>
            <span className="text-[14.5px] leading-[1.5] tracking-[-0.01em] text-muted-foreground transition-colors duration-300 group-hover:text-foreground">
              {check.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
