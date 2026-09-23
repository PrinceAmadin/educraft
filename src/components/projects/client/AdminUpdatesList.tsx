"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuEye, LuEyeOff, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { cn, formatDateTime } from "@/lib/utils";
import type { ClientUpdateRow } from "@/lib/services/client-updates";

/** The client's feed as the admin sees it, with a hide/show switch per line. */
export function AdminUpdatesList({ projectCode, updates }: { projectCode: string; updates: ClientUpdateRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function toggle(u: ClientUpdateRow) {
    setBusyId(u.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${encodeURIComponent(projectCode)}/updates/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: !u.hidden }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setError("Could not change that update. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (updates.length === 0) return <p className="text-sm text-muted-foreground">Nothing on the client&apos;s feed yet.</p>;

  return (
    <div className="space-y-2">
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <ul>
        {updates.map((u) => (
          <li key={u.id} className="flex items-start justify-between gap-3 border-b border-border/40 py-3 last:border-0">
            <div className={cn("min-w-0", u.hidden && "opacity-50")}>
              <p className="text-sm font-medium text-foreground">
                {u.title}
                {u.hidden ? <span className="ml-2 text-xs font-normal text-muted-foreground">Hidden from client</span> : null}
              </p>
              {u.body ? <p className="mt-0.5 text-sm text-muted-foreground">{u.body}</p> : null}
              <p className="mt-0.5 text-xs text-subtle">
                {formatDateTime(u.createdAt)}
                {u.manual ? " · posted by the team" : ""}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => void toggle(u)}
              disabled={busyId === u.id}
              aria-label={u.hidden ? `Show "${u.title}" to the client again` : `Hide "${u.title}" from the client`}
              title={u.hidden ? "Show to the client" : "Hide from the client"}
            >
              {busyId === u.id ? (
                <LuLoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : u.hidden ? (
                <LuEye className="size-4" aria-hidden />
              ) : (
                <LuEyeOff className="size-4" aria-hidden />
              )}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
