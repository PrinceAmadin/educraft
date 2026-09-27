/**
 * Whether a session's login still stands (checked on every server-side read of
 * the session, in `auth.ts`): it exists, it is switched on, and its role is the
 * one the session was issued with. "end" signs the session out. A role change
 * ends it too, rather than swapping the role inside it: the edge middleware
 * routes by the role in the cookie, so a swapped role would bounce between
 * pages until the cookie refreshed. A database error keeps the session (signing
 * everyone out on a blip would be worse) and is logged.
 *
 * Pure apart from the lookup it is given, so `npm run check:rbac` tests it.
 */
export type LoginLookup = (id: string) => Promise<{ isActive: boolean; role: string } | null>;

export async function recheckLogin(token: { id?: unknown; role?: unknown }, lookup: LoginLookup): Promise<"keep" | "end"> {
  if (typeof token.id !== "string" || !token.id) return "end";
  try {
    const login = await lookup(token.id);
    if (!login || !login.isActive || login.role !== token.role) return "end";
    return "keep";
  } catch (error) {
    console.error("[auth] could not re-check the login, keeping the session", error);
    return "keep";
  }
}
