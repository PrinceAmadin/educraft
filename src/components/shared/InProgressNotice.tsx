import { LuHammer } from "react-icons/lu";

/**
 * A page that is real but not yet built out: says which phase brings it and
 * what will be here, on a zone band — never a bare "coming soon" or a 404.
 */
export function InProgressNotice({ phase, summary, items }: { phase: string; summary: string; items: string[] }) {
  return (
    <section className="rounded-2xl bg-zone p-5 sm:p-6" aria-label={`Coming in ${phase}`}>
      <div className="flex items-start gap-3">
        <span className="rounded-full bg-card p-2.5 text-primary shadow-soft">
          <LuHammer className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="meta-label text-primary">Coming in {phase}</p>
          <p className="mt-1 text-sm font-medium text-foreground">{summary}</p>
          <ul className="mt-3 list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-muted-foreground">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
