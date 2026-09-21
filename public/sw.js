/* EduCraft HQ service worker.
 *
 * What it does:
 *  - keeps the app shell (JS, CSS, fonts, icons) so the app opens instantly and offline;
 *  - serves a friendly /offline page for anything it has no safe copy of;
 *  - keeps a "last seen" copy of a few low-risk worker/ambassador pages, per signed-in
 *    user, so they still open without signal (the page labels them as saved copies);
 *  - shows push notifications.
 *
 * What it deliberately never does: cache /api, admin pages, or any money page
 * (earnings, commissions, finance, payouts). Those always come from the network.
 * Saved pages are wiped on sign-out and never shared between users.
 */

// Bump when a cached shell asset changes without its URL changing (icons are cache-first).
const VERSION = "v2";
const STATIC = `ec-static-${VERSION}`;
const PAGES_PREFIX = "ec-pages-"; // + userId
const META = "ec-meta";
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

// Pages whose last-seen copy may be shown offline. Earnings and commissions are absent on purpose.
const OFFLINE_OK = [
  /^\/worker\/?$/,
  /^\/worker\/projects\/?$/,
  /^\/worker\/projects\/[^/]+\/?$/,
  /^\/worker\/profile\/?$/,
  /^\/ambassador\/?$/,
  /^\/ambassador\/link\/?$/,
  /^\/ambassador\/referrals\/?$/,
  /^\/ambassador\/leaderboard\/?$/,
  /^\/ambassador\/profile\/?$/,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("ec-static-") && k !== STATIC).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// ── Who is signed in (so saved pages never cross between users) ─────────────

async function getUid() {
  const cache = await caches.open(META);
  const res = await cache.match("/__uid");
  return res ? res.text() : null;
}

async function setUid(uid) {
  const cache = await caches.open(META);
  if (uid) await cache.put("/__uid", new Response(uid));
  else await cache.delete("/__uid");
  // Drop every other person's saved pages.
  const keep = uid ? PAGES_PREFIX + uid : null;
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.startsWith(PAGES_PREFIX) && k !== keep).map((k) => caches.delete(k)));
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "session") event.waitUntil(setUid(data.userId || null));
});

// ── Fetching ────────────────────────────────────────────────────────────────

function offlineJson() {
  return new Response(JSON.stringify({ error: "You're offline. Try again when you're back online." }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

async function cacheFirst(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function page(event, req, url) {
  const savable = OFFLINE_OK.some((re) => re.test(url.pathname));
  try {
    const res = await fetch(req);
    if (savable && res.ok && !res.redirected && res.type === "basic") {
      const uid = await getUid();
      if (uid) {
        const copy = res.clone();
        event.waitUntil(caches.open(PAGES_PREFIX + uid).then((c) => c.put(req, copy)));
      }
    }
    return res;
  } catch (err) {
    if (savable) {
      const uid = await getUid();
      if (uid) {
        const cache = await caches.open(PAGES_PREFIX + uid);
        const hit = await cache.match(req, { ignoreVary: true });
        if (hit) return hit;
      }
    }
    // A failed client-side (RSC) fetch makes Next.js fall back to a full navigation,
    // which lands here as a "navigate" request and gets the saved page or /offline.
    if (req.mode === "navigate") {
      const fallback = await caches.match(OFFLINE_URL);
      if (fallback) return fallback;
    }
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.method !== "GET") {
    // Mutations are never queued or replayed: fail clearly so the UI can say so.
    if (url.pathname.startsWith("/api/")) event.respondWith(fetch(req).catch(offlineJson));
    return;
  }

  if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/images/")
  ) {
    event.respondWith(cacheFirst(req));
    return;
  }

  if (req.mode === "navigate" || req.headers.get("RSC")) {
    event.respondWith(page(event, req, url));
  }
});

// ── Push notifications ──────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    /* malformed payload: fall back to the defaults below */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "EduCraft HQ", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag || undefined,
      data: { url: data.url || "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/dashboard", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const win of windows) {
        if ("focus" in win) {
          await win.focus();
          if ("navigate" in win) {
            try {
              await win.navigate(target);
            } catch (e) {
              /* cross-origin or detached: focusing is enough */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })()
  );
});
