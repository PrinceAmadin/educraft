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
 * nothing of one person stays with the next. A no-op when nobody is signed in,
 * and when the same person signs in again with their own email (their saved
 * pages and notifications stay). A Client ID can't be compared, so it clears.
 */
export async function clearDeviceBeforeSwitch(identifier?: string): Promise<void> {
  // This runs BEFORE sign-in, so it must never be what stops someone signing in:
  // most users are on phones with patchy signal, and an unbounded fetch would
  // leave the button on "Signing in…" for as long as the network hangs. On a
  // timeout we skip the clearing and let the sign-in through; Sign out still
  // clears properly, and the next sign-out catches anything left behind.
  const controller = new AbortController();
  const abort = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch("/api/auth/session", { cache: "no-store", signal: controller.signal });
    const session = (await res.json().catch(() => null)) as { user?: { email?: string | null } } | null;
    if (!session?.user) return;
    const typed = identifier?.trim().toLowerCase();
    if (typed && typed.includes("@") && session.user.email?.toLowerCase() === typed) return;
  } catch {
    return;
  } finally {
    clearTimeout(abort);
  }
  await Promise.race([disablePush(), new Promise((resolve) => setTimeout(resolve, 2500))]);
  await clearOfflineData();
}
