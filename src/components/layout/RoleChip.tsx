import { effectiveRole, isExecRole, ROLE_BADGE, ROLE_TITLES, type RoleTone } from "@/lib/rbac";
import { cn } from "@/lib/utils";

const TONE: Record<RoleTone, string> = {
  teal: "bg-primary/15 text-primary",
  gold: "bg-gold/15 text-gold",
  green: "bg-success/15 text-success",
  purple: "bg-purple/15 text-purple",
};

/**
 * The small coloured chip that says who is signed in and as what: CEO (teal),
 * CFO (gold), HOG (green), COO (purple). Nothing for a non-executive login.
 * The same chip tags an executive's own ambassador and worker records in lists.
 * `plain` is for the ambassador portal, where students read it: "Head of
 * Growth" instead of "HOG" (CEO, CFO and COO are understood as they are).
 */
export function RoleChip({ role, className, plain = false }: { role: string | undefined | null; className?: string; plain?: boolean }) {
  const r = effectiveRole(role);
  if (!isExecRole(r)) return null;
  const badge = ROLE_BADGE[r];
  const label = plain && r === "HOG" ? ROLE_TITLES.HOG : badge.label;
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full px-2 text-[11px] font-semibold uppercase tracking-wide",
        TONE[badge.tone],
        className
      )}
      title={`EduCraft executive · ${ROLE_TITLES[r]}`}
    >
      <span className="sr-only">EduCraft executive: </span>
      {label}
    </span>
  );
}
