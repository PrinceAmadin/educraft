import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { isClientSessionExpired, isPersonRole, isStaffRole, PORTAL_ROOTS } from "@/lib/roles";
import { canAccessRoute, canCallAdminApi, homeForRole } from "@/lib/rbac";
import { PATHNAME_HEADER } from "@/lib/request-path";

const { auth } = NextAuth(authConfig);

/** Route prefix each person-role is allowed into. Every staff role lives under /admin. */
const ROLE_ROOT: Record<string, string> = {
  WORKER: "/worker",
  AMBASSADOR: "/ambassador",
  CLIENT: "/client",
};

function rootFor(role: string): string | undefined {
  return isStaffRole(role) ? "/admin" : ROLE_ROOT[role];
}

const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

export default auth((req) => {
  const { nextUrl } = req;
  const user = req.auth?.user;
  const path = nextUrl.pathname;

  // Whole path segments only — `/ambassador-panel/*` is a public page and must
  // not be caught by the `/ambassador` portal prefix.
  const under = (root: string) => path === root || path.startsWith(`${root}/`);

  // /api/admin/* is judged by the same domain table as the admin pages, but
  // answers JSON (401/403) rather than redirecting: a fetch cannot follow a
  // redirect to a dashboard. Every handler still runs its own session guard.
  if (under("/api/admin")) {
    if (!user || isClientSessionExpired(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isStaffRole(user.role) || !canCallAdminApi(user.role, path, req.method)) return forbidden();
    return NextResponse.next();
  }

  // /client/login is the clients' public sign-in; the rest of /client is theirs alone.
  const isClientLogin = path === "/client/login";
  const isProtected = under("/admin") || under("/worker") || under("/ambassador") || (under("/client") && !isClientLogin);

  // Client sessions last 14 days from sign-in (a client's projects are private).
  const clientExpired = isClientSessionExpired(user);
  // Where to come back to after signing in: the path AND its query string, so a
  // Paystack return (?payment=success&reference=…) survives the detour.
  const backTo = `${path}${nextUrl.search}`;
  // (A client-first login that also holds a worker or ambassador profile gets the
  // same 14 days everywhere.)
  if (clientExpired && isProtected) {
    const login = new URL(under("/client") ? "/client/login" : "/login", nextUrl);
    login.searchParams.set("callbackUrl", backTo);
    return NextResponse.redirect(login);
  }

  // Sign-in pages stay reachable while signed in: they say who is signed in and
  // signing in again replaces the session. (Silently bouncing to the current
  // account's dashboard made "sign in as the worker" land on the admin area.)

  if (!isProtected) return NextResponse.next();

  if (!user) {
    const login = new URL(under("/client") ? "/client/login" : "/login", nextUrl);
    login.searchParams.set("callbackUrl", backTo);
    return NextResponse.redirect(login);
  }

  // One person can be a worker, an ambassador and a client on the same login. The
  // edge cannot query the database, so it lets any of those logins into all three
  // roots and each portal's own layout sends them home unless they really hold
  // that profile. Staff stay in /admin.
  const ownRoot = rootFor(user.role);
  const allowedRoots = isPersonRole(user.role)
    ? [ownRoot, ...Object.values(PORTAL_ROOTS)].filter((r): r is string => Boolean(r))
    : [ownRoot].filter((r): r is string => Boolean(r));

  // Wrong portal for this role → send them to their own
  if (!allowedRoots.some((root) => under(root))) {
    return NextResponse.redirect(new URL(allowedRoots[0] ?? "/", nextUrl));
  }

  // Inside /admin, each executive is confined to their own domain: a page they
  // do not own sends them silently to their home, not to a 403. SUPER_ADMIN
  // passes everything; a page no rule names is SUPER_ADMIN only.
  if (under("/admin")) {
    if (!canAccessRoute(user.role, path)) {
      const home = homeForRole(user.role);
      // The home itself is always allowed by the table; if a future edit ever
      // broke that, fall out to the site root rather than loop.
      return NextResponse.redirect(new URL(canAccessRoute(user.role, home) ? home : "/", nextUrl));
    }
    // Stamp the pathname so the admin layout can re-run the same check on the
    // server (layouts cannot see the URL). Overwritten on every request, so a
    // value the browser sent is never read.
    const headers = new Headers(req.headers);
    headers.set(PATHNAME_HEADER, path);
    return NextResponse.next({ request: { headers } });
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|images|icons|favicon.ico|manifest.webmanifest|sw.js|offline|.*\\.png$).*)",
    "/api/admin/:path*",
  ],
};
