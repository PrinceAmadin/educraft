import { cn } from "@/lib/utils";

/**
 * The hero visual: an academic workspace built from paper, not UI chrome.
 *
 * A project report sheet anchors the composition; a defence slide, a reference
 * card, a review indicator and a supervisor's margin note orbit it at different
 * scales and rotations. Purely decorative — the whole block is aria-hidden and
 * every fact it shows is stated in the hero copy beside it.
 */
export function HeroComposition({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("relative isolate select-none", className)}
      style={{ perspective: "1400px" }}
    >
      {/* Ambient wash behind the paper — depth without a container */}
      <div className="pointer-events-none absolute -inset-x-16 -inset-y-24 -z-10 ambient-teal opacity-90" />
      <div className="pointer-events-none absolute -inset-x-16 -inset-y-24 -z-10 ambient-gold" />

      {/* Ghost sheet — blurred, sets the stack reading back into space */}
      <div
        className="absolute right-[6%] top-[6%] hidden h-[62%] w-[54%] rotate-[7deg] rounded-[3px] bg-paper/25 blur-[2px] md:block"
        style={{ transform: "rotate(7deg) translateZ(-90px)" }}
      />

      {/* ── Anchor: project report ─────────────────────────── */}
      <article className="paper-surface relative z-20 mx-auto w-[86%] max-w-[420px] -rotate-[1.6deg] rounded-[3px] px-6 py-7 sm:px-8 sm:py-9 md:mx-0 md:ml-[4%] md:w-[78%]">
        <header className="flex items-baseline justify-between">
          <span className="font-mono text-[9.5px] font-medium tracking-[0.18em] text-paper-muted">
            EC-00234
          </span>
          <span className="font-mono text-[9.5px] font-medium uppercase tracking-[0.18em] text-paper-muted">
            Final Year Project
          </span>
        </header>

        <p className="mt-5 text-[19px] font-semibold leading-[1.22] tracking-[-0.022em] text-paper-ink sm:text-[21px]">
          Design and Fabrication of a Solar-Powered Water Purification System
        </p>

        <p className="mt-2.5 font-mono text-[10px] tracking-[0.04em] text-paper-muted">
          Department of Mechanical Engineering
        </p>

        <div className="mt-6 h-px bg-paper-ink/[0.12]" />

        <ol className="mt-5 space-y-[13px]">
          {[
            ["One", "Introduction", "1"],
            ["Two", "Literature Review", "14"],
            ["Three", "Methodology", "38"],
            ["Four", "Results & Analysis", "57"],
            ["Five", "Conclusion", "82"],
          ].map(([num, title, page], i) => (
            <li key={num} className="flex items-baseline gap-3">
              <span className="w-[52px] shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-paper-muted">
                Ch. {num}
              </span>
              <span
                className={cn(
                  "text-[12.5px] tracking-[-0.01em]",
                  i === 3 ? "font-medium text-paper-ink" : "text-paper-ink/[0.72]"
                )}
              >
                {title}
              </span>
              {/* Leader dots, the way a real contents page sets */}
              <span className="mx-1 h-px flex-1 translate-y-[-2px] bg-paper-ink/15" />
              <span className="font-mono text-[10px] tabular-nums text-paper-muted">
                {page}
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-6 h-px bg-paper-ink/[0.12]" />

        {/* Faux body copy — typographic texture, not grey blocks */}
        <div className="mt-5 space-y-[7px]">
          <div className="h-[5px] w-full rounded-[1px] bg-paper-ink/[0.12]" />
          <div className="h-[5px] w-[96%] rounded-[1px] bg-paper-ink/[0.12]" />
          <div className="h-[5px] w-[89%] rounded-[1px] bg-paper-ink/[0.12]" />
          <div className="h-[5px] w-[64%] rounded-[1px] bg-paper-ink/10" />
        </div>

        <footer className="mt-7 flex items-baseline justify-between font-mono text-[9.5px] tracking-[0.12em] text-paper-muted">
          <span>University of Benin</span>
          <span className="tabular-nums">iv</span>
        </footer>
      </article>

      {/* ── Defence slide, bleeding off the left edge ───────── */}
      <div className="paper-surface absolute -left-[7%] bottom-[9%] z-30 w-[52%] max-w-[248px] rotate-[3.4deg] rounded-[3px] px-4 py-3.5 sm:px-5 sm:py-4">
        <div className="flex items-center gap-2">
          <span className="h-[7px] w-[7px] rounded-full bg-primary" />
          <span className="font-mono text-[8.5px] font-medium uppercase tracking-[0.18em] text-paper-muted">
            Defence slides
          </span>
        </div>

        <p className="mt-3 text-[13px] font-semibold leading-tight tracking-[-0.02em] text-paper-ink">
          Chapter Four — Results
        </p>

        {/* Small analysis figure, drawn not imported */}
        <div className="mt-3.5 flex h-[42px] items-end gap-[5px]">
          {[38, 62, 47, 88, 71, 54, 96].map((h, i) => (
            <span
              key={i}
              style={{ height: `${h}%` }}
              className={cn(
                "flex-1 rounded-[1px]",
                i === 6 ? "bg-primary" : i === 3 ? "bg-primary/55" : "bg-paper-ink/[0.16]"
              )}
            />
          ))}
        </div>

        <div className="mt-3 flex items-baseline justify-between font-mono text-[8.5px] tracking-[0.1em] text-paper-muted">
          <span>Fig. 4.2 — Purification yield</span>
          <span className="tabular-nums">12 / 24</span>
        </div>
      </div>

      {/* ── Reference card, top right, partially outside ────── */}
      <div className="paper-surface absolute right-0 top-[3%] z-10 hidden w-[44%] max-w-[210px] -rotate-[4.2deg] rounded-[3px] px-4 py-3.5 sm:block">
        <span className="font-mono text-[8.5px] font-medium uppercase tracking-[0.18em] text-paper-muted">
          References · APA 7th
        </span>
        <div className="mt-3 space-y-[9px]">
          {[
            ["Adeyemi, K. O. (2023).", "Solar desalination in arid regions."],
            ["Okonkwo, C. (2021).", "Membrane filtration efficiency."],
            ["Bello, A. & Ige, T. (2024).", "Photovoltaic water systems."],
          ].map(([author, title]) => (
            <p key={author} className="pl-3 -indent-3 text-[9.5px] leading-[1.5] text-paper-ink/70">
              <span className="font-medium text-paper-ink/85">{author}</span> {title}
            </p>
          ))}
        </div>
      </div>

      {/* ── Review indicator — the one piece of "interface" ── */}
      <div className="absolute right-[3%] top-[47%] z-40 flex items-center gap-2.5 rounded-[4px] bg-ink/85 px-3 py-2 backdrop-blur-md ring-1 ring-inset ring-white/10">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-pulse-dot rounded-full bg-primary" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
        </span>
        <span className="font-mono text-[9.5px] font-medium tracking-[0.1em] text-white/85">
          CH. 4 · IN QA REVIEW
        </span>
      </div>

      {/* ── Supervisor's margin note — gold, used once ──────── */}
      <div className="absolute -bottom-[2%] right-[4%] z-40 hidden items-start gap-2.5 md:flex">
        <span className="mt-2 h-px w-7 bg-gold/60" />
        <p className="max-w-[132px] accent-serif text-[15px] leading-[1.3] text-gold">
          Approved by supervisor
        </p>
      </div>
    </div>
  );
}
