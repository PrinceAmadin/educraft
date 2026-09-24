"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { TIER_LADDER } from "@/lib/ambassador";
import { SELECTABLE_AMBASSADOR_STATUSES } from "@/lib/validations/ambassadors";
import type { AmbassadorTier } from "@prisma/client";

export function AmbassadorControls({
  ambassadorId,
  status,
  tier,
  provisional,
}: {
  ambassadorId: string;
  status: string;
  tier: AmbassadorTier;
  /** On a 30-day provisional slot, so the founder can confirm it early. */
  provisional?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<"status" | "tier" | "slotAction" | null>(null);

  async function patch(field: "status" | "tier" | "slotAction", value: string) {
    setBusy(field);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ambassadors/${ambassadorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not update.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update.");
    } finally {
      setBusy(null);
    }
  }

  // "Lapsed" is set by the provisional sweep, never chosen — but a lapsed
  // ambassador still needs their own status shown as the current value.
  const statusOptions = SELECTABLE_AMBASSADOR_STATUSES.includes(status as never)
    ? SELECTABLE_AMBASSADOR_STATUSES
    : [status, ...SELECTABLE_AMBASSADOR_STATUSES];

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="mb-1 block meta-label">
          Status
        </span>
        <Select
          defaultValue={status}
          disabled={busy !== null}
          onChange={(e) => patch("status", e.target.value)}
          className="h-10 w-40 text-sm"
          aria-label="Ambassador status"
        >
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </label>

      <label className="block">
        <span className="mb-1 block meta-label">
          Tier
        </span>
        <Select
          defaultValue={tier}
          disabled={busy !== null}
          onChange={(e) => patch("tier", e.target.value)}
          className="h-10 w-40 text-sm"
          aria-label="Ambassador tier"
        >
          {TIER_LADDER.map((t) => (
            <option key={t.tier} value={t.tier}>
              {t.label} ({t.rate}%)
            </option>
          ))}
        </Select>
      </label>

      {provisional ? (
        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => void patch("slotAction", "confirm")}
        >
          Confirm slot now
        </Button>
      ) : null}

      {status === "Lapsed" ? (
        <div>
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => void patch("slotAction", "reinstate")}
          >
            Reinstate
          </Button>
          <p className="mt-1 max-w-56 text-xs text-muted-foreground">
            Starts a fresh 30 days. Give them a slot again from Manage.
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="flex w-full items-center gap-1 text-xs text-danger">
          <LuCircleAlert className="size-3.5" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
