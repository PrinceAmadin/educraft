import { signOut } from "next-auth/react";
import { disablePush } from "@/lib/pwa/push-client";

/**
 * Everything the app keeps on the device for a person: saved pages (the service
 * worker's per-user caches) and the "last seen" times. Phones get shared, so this
 * runs on every sign-out.
 */
export async function clearOfflineData(): Promise<void> {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("ec-pages-") || k === "ec-meta").map((k) => caches.delete(k)));
    }
  } catch {
    /* nothing to clear */
  }
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("ec:lastSeen:")) localStorage.removeItem(key);
    }
  } catch {
    /* storage blocked */
  }
}

/**
 * Sign out and leave nothing of this person on the device: stop their push
 * notifications first (the session is still valid for that call), then wipe saved pages.
 * Clients land back on their own sign-in page, everyone else on the team one.
 */
export async function signOutAndClear(): Promise<void> {
  const fromClientPortal = window.location.pathname === "/client" || window.location.pathname.startsWith("/client/");
  await Promise.race([disablePush(), new Promise((resolve) => setTimeout(resolve, 2500))]);
  await clearOfflineData();
  await signOut({ callbackUrl: fromClientPortal ? "/client/login" : "/login" });
}

/**
 * Before a sign-in replaces a session that is still on this device (the sign-in
 * forms stay usable while signed in): stop the previous person's phone
 * notifications and wipe their saved pages, exactly as Sign out would, so
 * nothing of one person stays with the next. A no-op when nobody is signed in.
 */
export async function clearDeviceBeforeSwitch(): Promise<void> {
  try {
    const res = await fetch("/api/auth/session", { cache: "no-store" });
    const session = (await res.json().catch(() => null)) as { user?: unknown } | null;
    if (!session?.user) return;
  } catch {
    return;
  }
  await Promise.race([disablePush(), new Promise((resolve) => setTimeout(resolve, 2500))]);
  await clearOfflineData();
}
