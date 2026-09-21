/** Browser-side helpers for web push. Every function is safe to call where push is unsupported. */

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** The registration, or null when the service worker isn't registered (dev, or first load). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
}

async function saveOnServer(sub: PushSubscription): Promise<boolean> {
  const json = sub.toJSON();
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
  return res.ok;
}

/** Re-post an existing subscription so it belongs to whoever is signed in now. */
export async function syncSubscription(): Promise<void> {
  try {
    const sub = await currentSubscription();
    if (sub) await saveOnServer(sub);
  } catch {
    /* best effort */
  }
}

export type EnablePushResult = "on" | "blocked" | "unsupported" | "error";

/** Must run from a tap: iOS and most browsers only show the permission prompt for a user gesture. */
export async function enablePush(): Promise<EnablePushResult> {
  if (!pushSupported()) return "unsupported";
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return "unsupported";

  try {
    const reg = await registration();
    if (!reg) return "unsupported";

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return permission === "denied" ? "blocked" : "error";

    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      }));
    return (await saveOnServer(sub)) ? "on" : "error";
  } catch {
    return "error";
  }
}

/** Stop pushes to this device: forget it on the server (while still signed in), then in the browser. */
export async function disablePush(): Promise<void> {
  try {
    const sub = await currentSubscription();
    if (!sub) return;
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => undefined);
    await sub.unsubscribe();
  } catch {
    /* best effort */
  }
}
