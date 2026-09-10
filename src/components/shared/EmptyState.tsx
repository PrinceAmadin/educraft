import Link from "next/link";
import type { AppIcon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: AppIcon;
  title: string;
  description?: string;
  action?: { label: string; href: string };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center",
        className
      )}
    >
      <span className="rounded-lg bg-elevated p-2.5 text-muted-foreground">
        <Icon className="size-6" aria-hidden />
      </span>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? (
          <p className="mx-auto mt-1 max-w-[42ch] text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? (
        <Button asChild variant="outline" size="sm" className="mt-1">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      ) : null}
    </div>
  );
}
