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
 */
export async function signOutAndClear(): Promise<void> {
  await Promise.race([disablePush(), new Promise((resolve) => setTimeout(resolve, 2500))]);
  await clearOfflineData();
  await signOut({ callbackUrl: "/login" });
}
