import type { ProjectStatus } from "@prisma/client";
import { STATUS_META } from "@/lib/status";
import { cn } from "@/lib/utils";

export function StatusBadge({
  status,
  className,
  short = false,
}: {
  status: ProjectStatus;
  className?: string;
  short?: boolean;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        meta.badge,
        className
      )}
    >
      {short ? meta.short : meta.label}
    </span>
  );
}
