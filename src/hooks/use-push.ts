"use client";

import * as React from "react";
import {
  currentSubscription,
  disablePush,
  enablePush,
  pushSupported,
  syncSubscription,
} from "@/lib/pwa/push-client";

export type PushState = "unsupported" | "off" | "on" | "blocked";

/** Whether this device gets push notifications, and the two ways to change that. */
export function usePush() {
  const [state, setState] = React.useState<PushState>("unsupported");
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!pushSupported() || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return setState("unsupported");
    if (Notification.permission === "denied") return setState("blocked");
    const sub = await currentSubscription().catch(() => null);
    if (sub) {
      // A phone that stayed signed in as someone else must not keep sending their pushes here.
      void syncSubscription();
      setState("on");
    } else {
      setState("off");
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = React.useCallback(async () => {
    setBusy(true);
    try {
      const result = await enablePush();
      if (result === "on") setState("on");
      else if (result === "blocked") setState("blocked");
      else await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const disable = React.useCallback(async () => {
    setBusy(true);
    try {
      await disablePush();
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  return { state, busy, enable, disable };
}
