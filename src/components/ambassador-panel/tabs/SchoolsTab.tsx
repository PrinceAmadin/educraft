"use client";

import * as React from "react";
import { usePanel } from "@/components/ambassador-panel/context";
import { Empty } from "@/components/ambassador-panel/shared";
import { SCHOOL_NAMES } from "@/lib/ambassador-panel/seed-roster";

/** Coverage by school — general slots, plus every Core and Sub counted as active. */
export function SchoolsTab() {
  const { data } = usePanel();

  const schools = React.useMemo(() => {
    const m: Record<string, { active: number; vacant: number }> = {};
    const bump = (school: string, active: boolean) => {
      const key = school || "—";
      if (!m[key]) m[key] = { active: 0, vacant: 0 };
      if (active) m[key].active += 1;
      else m[key].vacant += 1;
    };
    for (const s of Object.values(data.roster.slots)) bump(s.school, s.status === "active");
    for (const c of data.roster.coreAmbassadors) if (c.school) bump(c.school, true);
    for (const s of data.roster.subAmbassadors) if (s.school) bump(s.school, true);
    return Object.entries(m).sort((a, b) => b[1].active + b[1].vacant - (a[1].active + a[1].vacant));
  }, [data.roster]);

  if (schools.length === 0) return <Empty>No schools on the roster yet.</Empty>;

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-muted-foreground">
        <span className="font-mono tabular-nums text-foreground">{schools.length}</span> schools on the roster
      </p>
      <ul className="grid gap-x-12 lg:grid-cols-2">
        {schools.map(([abbr, st]) => {
          const total = st.active + st.vacant;
          const pct = total ? Math.round((st.active / total) * 100) : 0;
          return (
            <li key={abbr} className="border-b border-border/80 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-foreground">{abbr}</p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {SCHOOL_NAMES[abbr] ?? (abbr === "—" ? "No school recorded" : `${abbr} University`)}
                  </p>
                </div>
                <span className="font-mono text-xl font-medium tabular-nums text-foreground">{total}</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border" aria-hidden>
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="text-success">{st.active} active</span> · <span className="text-gold">{st.vacant} vacant</span> ·{" "}
                <span className="font-mono">{pct}%</span> filled
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
