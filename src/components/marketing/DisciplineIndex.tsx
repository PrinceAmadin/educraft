import { cn } from "@/lib/utils";

const DISCIPLINES = [
  { name: "Mechanical Engineering", count: "142" },
  { name: "Computer Science", count: "138" },
  { name: "Accounting & Finance", count: "121" },
  { name: "Business Administration", count: "97" },
  { name: "Mass Communication", count: "84" },
  { name: "Electrical Engineering", count: "79" },
  { name: "Nursing & Public Health", count: "68" },
  { name: "Law", count: "54" },
  { name: "Economics", count: "51" },
  { name: "Political Science", count: "47" },
  { name: "Microbiology", count: "43" },
  { name: "Education", count: "38" },
];

/**
 * Disciplines as an index, not a tag cloud. Two typographic columns with
 * hairline separators — the same convention as the contents page in the hero.
 */
export function DisciplineIndex({ className }: { className?: string }) {
  return (
    <ul className={cn("columns-1 gap-x-12 sm:columns-2", className)}>
      {DISCIPLINES.map((d, i) => (
        <li
          key={d.name}
          className="group flex break-inside-avoid items-baseline gap-3 py-3"
        >
          <span className="index-mark w-6 shrink-0 text-subtle">
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className="text-[15px] tracking-[-0.01em] text-foreground/85 transition-colors duration-300 group-hover:text-foreground">
            {d.name}
          </span>
          <span className="mx-1 h-px flex-1 translate-y-[-3px] bg-hairline/[0.12]" />
          <span className="font-mono text-[11px] tabular-nums text-subtle">{d.count}</span>
        </li>
      ))}
    </ul>
  );
}
