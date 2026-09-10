"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * URL-bound search box. Writes `?q=` (debounced) and clears `?page=` on every
 * change so a search always lands on page 1.
 */
export function SearchInput({
  placeholder = "Search",
  paramKey = "q",
  className,
}: {
  placeholder?: string;
  paramKey?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = React.useState(searchParams.get(paramKey) ?? "");

  React.useEffect(() => {
    setValue(searchParams.get(paramKey) ?? "");
  }, [searchParams, paramKey]);

  React.useEffect(() => {
    const current = searchParams.get(paramKey) ?? "";
    if (value === current) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      if (value.trim()) next.set(paramKey, value.trim());
      else next.delete(paramKey);
      next.delete("page");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }, 350);
    return () => clearTimeout(t);
  }, [value, searchParams, paramKey, pathname, router]);

  return (
    <label className={className}>
      <span className="relative block">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
          aria-hidden
        />
        <Input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="pl-9"
          aria-label={placeholder}
        />
      </span>
    </label>
  );
}
