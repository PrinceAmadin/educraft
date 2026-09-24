"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { cn } from "@/lib/utils";

/** Previous / next over the filtered rows, keeping every other search param. */
export function RevenuePager({ page, pageCount, total, pageSize }: { page: number; pageCount: number; total: number; pageSize: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hrefFor = (p: number) => {
    const next = new URLSearchParams(searchParams.toString());
    if (p <= 1) next.delete("page");
    else next.set("page", String(p));
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const linkClass = (disabled: boolean) =>
    cn(
      "inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-[13px] font-medium transition-colors",
      disabled ? "pointer-events-none text-subtle" : "text-muted-foreground hover:bg-zone hover:text-foreground"
    );

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[13px] text-muted-foreground">
        {total === 0 ? "No payments" : `${from}–${to} of ${total} payment${total === 1 ? "" : "s"}`}
      </p>
      {pageCount > 1 ? (
        <div className="flex items-center gap-1">
          <Link href={hrefFor(page - 1)} aria-disabled={page <= 1} className={linkClass(page <= 1)}>
            <LuChevronLeft className="size-4" aria-hidden />
            Previous
          </Link>
          <span className="px-1 font-mono text-xs text-muted-foreground">
            {page} / {pageCount}
          </span>
          <Link href={hrefFor(page + 1)} aria-disabled={page >= pageCount} className={linkClass(page >= pageCount)}>
            Next
            <LuChevronRight className="size-4" aria-hidden />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
