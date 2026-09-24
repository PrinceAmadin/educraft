import { effectiveRole, isExecRole, ROLE_BADGE, type RoleTone } from "@/lib/rbac";
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
 */
export function RoleChip({ role, className }: { role: string | undefined | null; className?: string }) {
  const r = effectiveRole(role);
  if (!isExecRole(r)) return null;
  const badge = ROLE_BADGE[r];
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-full px-2 text-[11px] font-semibold uppercase tracking-wide",
        TONE[badge.tone],
        className
      )}
      title={badge.label}
    >
      {badge.label}
    </span>
  );
}
