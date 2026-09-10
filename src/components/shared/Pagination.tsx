"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (pageCount <= 1) {
    return (
      <p className="px-1 text-xs text-muted-foreground">
        {total} project{total === 1 ? "" : "s"}
      </p>
    );
  }

  const hrefFor = (p: number) => {
    const next = new URLSearchParams(searchParams.toString());
    if (p <= 1) next.delete("page");
    else next.set("page", String(p));
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <p className="text-xs text-muted-foreground">
        {first}–{last} of {total}
      </p>
      <div className="flex items-center gap-1">
        <PageLink href={hrefFor(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft className="size-4" aria-hidden />
        </PageLink>
        <span className="px-2 font-mono text-xs tabular-nums text-muted-foreground">
          {page} / {pageCount}
        </span>
        <PageLink href={hrefFor(page + 1)} disabled={page >= pageCount} aria-label="Next page">
          <ChevronRight className="size-4" aria-hidden />
        </PageLink>
      </div>
    </div>
  );
}

function PageLink({
  href,
  disabled,
  children,
  ...rest
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
  "aria-label": string;
}) {
  const className = cn(
    "inline-flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors",
    disabled
      ? "pointer-events-none opacity-40"
      : "hover:border-border-hover hover:bg-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  );

  if (disabled) {
    return (
      <span className={className} aria-disabled {...rest}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} scroll className={className} {...rest}>
      {children}
    </Link>
  );
}
