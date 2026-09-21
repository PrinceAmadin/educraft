"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { WifiOff } from "lucide-react";

const KEY = (path: string) => `ec:lastSeen:${path}`;
const RETRY_MS = 10_000;

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** The browser's own idea of being online (assumed online during server rendering). */
export function useOnline(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true
  );
}

/**
 * Whether EduCraft can actually be reached. `navigator.onLine` says true on a phone
 * with a bar of signal and no working data, and that is exactly when a saved page
 * gets shown — so it is checked with a real (tiny) request, retried while it fails.
 */
function useReachable(): "yes" | "no" | "checking" {
  const online = useOnline();
  const [reachable, setReachable] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const probe = async () => {
      if (stopped) return;
      if (!navigator.onLine) return setReachable(false);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store", signal: controller.signal });
        if (stopped) return;
        setReachable(res.ok);
        if (!res.ok) retry = setTimeout(probe, RETRY_MS);
      } catch {
        if (stopped) return;
        setReachable(false);
        retry = setTimeout(probe, RETRY_MS);
      } finally {
        clearTimeout(timeout);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void probe();
    };

    void probe();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(retry);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [online]);

  if (!online || reachable === false) return "no";
  return reachable ? "yes" : "checking";
}

/**
 * Shown while there is no usable connection. Pages that were saved are shown as they
 * were last seen, so this says when — and that anything that changes data has to wait.
 */
export function OfflineBanner() {
  const connection = useReachable();
  const pathname = usePathname();
  const [lastSeen, setLastSeen] = React.useState<string | null>(null);

  // A page that loaded while connected is what the service worker saved: remember when.
  // Only stamped once the connection is confirmed, never while still checking, or a
  // saved copy would be labelled as fresh.
  React.useEffect(() => {
    if (connection === "checking") return;
    try {
      if (connection === "yes") localStorage.setItem(KEY(pathname), String(Date.now()));
      const at = Number(localStorage.getItem(KEY(pathname)));
      setLastSeen(
        at ? new Date(at).toLocaleString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, day: "numeric", month: "short" }) : null
      );
    } catch {
      setLastSeen(null);
    }
  }, [pathname, connection]);

  if (connection !== "no") return null;

  return (
    <div role="status" className="mb-5 flex items-start gap-3 rounded-xl bg-gold/15 px-4 py-3 text-sm text-foreground">
      <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-gold" aria-hidden />
      <p>
        <span className="font-medium">You&apos;re offline.</span>{" "}
        <span className="text-muted-foreground">
          {lastSeen ? `Showing this page as it was on ${lastSeen}. ` : ""}
          Saving changes will work again when you&apos;re back online.
        </span>
      </p>
    </div>
  );
}
