"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  noun = "project",
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  /** What is being counted, singular: "project", "ambassador". */
  noun?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (pageCount <= 1) {
    return (
      <p className="text-[13px] text-muted-foreground">
        {total} {noun}{total === 1 ? "" : "s"}
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
    <div className="flex items-center justify-between gap-3">
      <p className="text-[13px] text-muted-foreground">
        <span className="font-mono tabular-nums">
          {first}–{last}
        </span>{" "}
        of <span className="font-mono tabular-nums">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <PageLink href={hrefFor(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <LuChevronLeft className="size-4" aria-hidden />
        </PageLink>
        <span className="px-2 font-mono text-[13px] tabular-nums text-muted-foreground">
          {page} / {pageCount}
        </span>
        <PageLink href={hrefFor(page + 1)} disabled={page >= pageCount} aria-label="Next page">
          <LuChevronRight className="size-4" aria-hidden />
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
    "inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors",
    disabled
      ? "pointer-events-none opacity-35"
      : "hover:bg-zone hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
