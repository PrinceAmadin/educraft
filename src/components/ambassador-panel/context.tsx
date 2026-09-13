"use client";

import * as React from "react";
import type { PanelOverview, Roster } from "@/lib/ambassador-panel/types";

/** Calls the panel router. GET when there is no body, POST otherwise. */
export async function panelCall<T = unknown>(action: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api/ambassador-panel/admin?action=${encodeURIComponent(action)}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(data?.error ?? "That did not work. Try again.");
  return data as T;
}

export type FlashTone = "success" | "danger" | "info";

export interface PanelContextValue {
  data: PanelOverview;
  /** Redis is not configured — everything renders, nothing can be changed. */
  readOnly: boolean;
  /** Founder only: reset and clear permanently delete tracking data. */
  canDelete: boolean;
  reload: () => Promise<void>;
  saveRoster: (next: Roster) => Promise<boolean>;
  applyRoster: (roster: Roster) => void;
  flash: (tone: FlashTone, message: string) => void;
}

export const PanelContext = React.createContext<PanelContextValue | null>(null);

export function usePanel(): PanelContextValue {
  const ctx = React.useContext(PanelContext);
  if (!ctx) throw new Error("usePanel must be used inside <AmbassadorPanel>");
  return ctx;
}

/** Page origin for building shareable links — the panel is client-only. */
export function useOrigin(): string {
  const [origin, setOrigin] = React.useState("");
  React.useEffect(() => setOrigin(window.location.origin), []);
  return origin;
}
