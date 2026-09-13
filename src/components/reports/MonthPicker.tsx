"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function MonthPicker({ month, currentMonth }: { month: string; currentMonth: string }) {
  const router = useRouter();

  function go(next: string) {
    router.push(`/admin/reports?month=${next}`);
  }

  return (
    <div className="flex items-center gap-2 surface p-1.5">
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Previous month"
        onClick={() => go(shiftMonth(month, -1))}
      >
        <ChevronLeft className="size-4" aria-hidden />
      </Button>
      <input
        type="month"
        value={month}
        max={currentMonth}
        onChange={(e) => e.target.value && go(e.target.value)}
        className="h-9 min-w-0 flex-1 rounded-md border-0 bg-transparent px-2 text-center text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-initial"
        aria-label="Report month"
      />
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Next month"
        disabled={month >= currentMonth}
        onClick={() => go(shiftMonth(month, 1))}
      >
        <ChevronRight className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
