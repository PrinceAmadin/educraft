import * as React from "react";
import Link from "next/link";
import { LuArrowLeft } from "react-icons/lu";
import { cn } from "@/lib/utils";

/**
 * Dashboard page heading. One scale for every screen: H1 at 24px on phones and
 * 28–30px from sm, an optional supporting line, actions on the right, and an
 * optional back link above. Sits directly on the page — no card, no rule.
 */
export function PageHeader({
  title,
  description,
  actions,
  back,
  eyebrow,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      {back ? (
        <Link
          href={back.href}
          className="-ml-1 inline-flex min-h-9 items-center gap-1.5 rounded-md px-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LuArrowLeft className="size-4" aria-hidden />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {eyebrow ? <div className="mb-1.5">{eyebrow}</div> : null}
          <h1 className="font-display text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-[1.75rem]">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 max-w-[65ch] text-[15px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
