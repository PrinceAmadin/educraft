"use client";

import * as React from "react";
import { LuCheck, LuCopy, LuLoaderCircle, LuRefreshCw, LuSmartphone, LuUsers, LuX } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm";
import { formatDate } from "@/lib/utils";

export interface GroupInviteState {
  token: string;
  status: "OPEN" | "BOUND" | "REVOKED";
  bound: boolean;
  boundAt: string | Date | null;
  url: string;
}

type Action = "ensure" | "regenerate" | "reset-device" | "revoke";

/**
 * The device-locked WhatsApp group link for one ambassador (founder + HOG).
 * The link is tied to the first device that opens it; the group it points to is
 * the one in Settings, changeable by the CEO. Here the HOG/CEO can regenerate,
 * free the device, or revoke.
 */
export function AmbassadorGroupLink({
  ambassadorId,
  initial,
}: {
  ambassadorId: string;
  initial: GroupInviteState | null;
}) {
  const confirm = useConfirm();
  const [invite, setInvite] = React.useState<GroupInviteState | null>(initial);
  const [busy, setBusy] = React.useState<Action | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  async function act(action: Action) {
    if (
      action === "revoke" &&
      !(await confirm({
        title: "Revoke this ambassador's group link?",
        description: "It stops working on their device.",
        confirmLabel: "Revoke",
        tone: "danger",
      }))
    )
      return;
    if (
      action === "regenerate" &&
      invite &&
      !(await confirm({
        title: "Replace the current link with a new one?",
        description: "The old link stops working.",
        confirmLabel: "Replace link",
      }))
    )
      return;
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ambassadors/${ambassadorId}/group-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => null)) as { invite?: GroupInviteState | null; error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "That action could not be completed.");
      setInvite(data?.invite ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That action could not be completed.");
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  const statusLine = invite
    ? invite.bound
      ? `Locked to a device${invite.boundAt ? ` since ${formatDate(invite.boundAt)}` : ""}`
      : "Not opened yet — the first device to open it is locked in"
    : null;

  return (
    <section className="surface p-4">
      <div className="flex items-center gap-2">
        <LuUsers className="size-4 text-primary" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">WhatsApp group link</h2>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        A device-locked link to the ambassador group. It opens only on the first device that opens it; the group it
        points to is set on Settings &rsaquo; General.
      </p>

      {invite ? (
        <>
          <div className="mt-3 flex items-center gap-2">
            <Input readOnly value={invite.url} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" size="sm" variant="outline" onClick={copy} className="shrink-0">
              {copied ? <LuCheck className="size-4" aria-hidden /> : <LuCopy className="size-4" aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{statusLine}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => act("regenerate")}>
              {busy === "regenerate" ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuRefreshCw className="size-4" aria-hidden />}
              New link
            </Button>
            {invite.bound ? (
              <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => act("reset-device")}>
                {busy === "reset-device" ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuSmartphone className="size-4" aria-hidden />}
                Free device
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-danger/40 text-danger hover:bg-danger/10"
              disabled={busy !== null}
              onClick={() => act("revoke")}
            >
              {busy === "revoke" ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuX className="size-4" aria-hidden />}
              Revoke
            </Button>
          </div>
        </>
      ) : (
        <div className="mt-3">
          <Button type="button" size="sm" disabled={busy !== null} onClick={() => act("ensure")}>
            {busy === "ensure" ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuUsers className="size-4" aria-hidden />}
            Generate group link
          </Button>
        </div>
      )}

      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </section>
  );
}
