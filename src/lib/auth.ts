import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import { verifyPassword } from "@/lib/services/client-otp";
import { isStaffRole, primaryPortal, type Portal } from "@/lib/roles";
import { EXEC_ROLE_LABELS } from "@/lib/rbac";
import { linkClientOrders } from "@/lib/services/account-links";
import { recheckLogin } from "@/lib/session-check";
import { sameExecPerson } from "@/lib/services/executives";
import { verifySwapToken } from "@/lib/auth-switch";

// Landing route per role lives with the rest of the access rules (edge-safe);
// re-exported here because every caller already imports it from `@/lib/auth`.
export { homeForRole } from "@/lib/rbac";

// One sign-in page for everyone: the first field takes an email, or a client's
// Client ID (ECC-0001).
const credentialsSchema = z.object({
  email: z.string().trim().min(1).max(160),
  password: z.string().min(1).max(200),
});

function requestIp(request: Request | undefined): string {
  const forwarded = request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request?.headers?.get("x-real-ip") || "unknown";
}

/** Records the sign-in (Team & Roles shows an invited executive as pending until their first). Never blocks a sign-in. */
async function touchSignIn(userId: string): Promise<void> {
  try {
    await db.user.update({ where: { id: userId }, data: { lastSignInAt: new Date() } });
  } catch (error) {
    console.error("[auth] could not record sign-in time", error);
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    /**
     * Every server-side read of the session (pages, layouts, API routes and
     * /api/auth/session) re-checks the login in the database, so deleting it,
     * switching it off, removing someone from the team or changing their role
     * ends the session at once, not when the 30-day token runs out. The edge
     * middleware cannot reach the database and keeps judging the token alone;
     * every page and API behind it calls `auth()`, which is where this runs.
     */
    async jwt(params) {
      const token = await authConfig.callbacks.jwt(params);
      // A fresh sign-in: `authorize` has just checked the login.
      if (params.user) return token;
      const verdict = await recheckLogin({ id: token.id, role: token.role }, (id) =>
        db.user.findUnique({ where: { id }, select: { isActive: true, role: true } })
      );
      return verdict === "keep" ? token : null;
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email: identifier, password } = parsed.data;

        // A client signing in here: the client check does it (with its lockout
        // after repeated wrong passwords). A Client ID is always a client.
        const clientSignIn = async () => {
          const client = await verifyPassword({ identifierInput: identifier, password, ip: requestIp(request) });
          if (!client) return null;
          await touchSignIn(client.userId);
          return { id: client.userId, email: client.email, name: client.name, role: client.role };
        };
        if (!identifier.includes("@")) return clientSignIn();

        const user = await db.user.findUnique({
          where: { email: identifier.toLowerCase() },
          include: {
            execProfile: { select: { fullName: true } },
            workerProfile: { select: { fullName: true, status: true } },
            ambassadorProfile: { select: { fullName: true, status: true } },
            clientProfiles: { select: { fullName: true }, take: 1 },
          },
        });

        if (!user || !user.isActive) return null;
        if (user.role === "CLIENT") return clientSignIn();

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        await touchSignIn(user.id);

        // The email is the person: client orders placed with it join this login
        // (see account-links.ts). Staff never hold client orders.
        if (!isStaffRole(user.role)) {
          await linkClientOrders(user.id, user.email);
        }

        // An executive's record names them (Team & Roles edits it); then the
        // explicit display name; then the role profile's own name; the email
        // local-part is a last resort, not a design.
        const name =
          user.execProfile?.fullName ??
          user.displayName ??
          user.workerProfile?.fullName ??
          user.ambassadorProfile?.fullName ??
          user.clientProfiles[0]?.fullName ??
          user.email.split("@")[0];

        return {
          id: user.id,
          email: user.email,
          name,
          role: user.role,
        };
      },
    }),
    // One-click account switching between an executive's login and their
    // other-email worker/ambassador login. `authorize` accepts an HMAC-signed
    // swap token from POST /api/auth/switch-account/token (60 s TTL) and
    // re-verifies the same-person link before it swaps — an `otherEmails` edit
    // inside the window cancels the swap.
    Credentials({
      id: "account-switch",
      name: "Account switch",
      credentials: {
        swapToken: { label: "Swap token", type: "text" },
        fromUserId: { label: "From user id", type: "text" },
        toUserId: { label: "To user id", type: "text" },
        exp: { label: "Expires at", type: "text" },
      },
      async authorize(raw) {
        const parsed = z
          .object({
            swapToken: z.string().min(1).max(200),
            fromUserId: z.string().min(1).max(64),
            toUserId: z.string().min(1).max(64),
            exp: z.coerce.number().int().positive(),
          })
          .safeParse(raw);
        if (!parsed.success) return null;

        const { swapToken, fromUserId, toUserId, exp } = parsed.data;
        if (!verifySwapToken({ fromUserId, toUserId, exp }, swapToken)) return null;

        // Belt and braces: re-check the same-person link right before the swap.
        const linked = await sameExecPerson(fromUserId, toUserId);
        if (!linked) return null;

        const target = await db.user.findUnique({
          where: { id: toUserId },
          include: {
            execProfile: { select: { fullName: true } },
            workerProfile: { select: { fullName: true, status: true } },
            ambassadorProfile: { select: { fullName: true, status: true } },
            clientProfiles: { select: { fullName: true }, take: 1 },
          },
        });
        if (!target || !target.isActive) return null;

        await touchSignIn(target.id);
        if (!isStaffRole(target.role)) {
          await linkClientOrders(target.id, target.email);
        }

        const name =
          target.execProfile?.fullName ??
          target.displayName ??
          target.workerProfile?.fullName ??
          target.ambassadorProfile?.fullName ??
          target.clientProfiles[0]?.fullName ??
          target.email.split("@")[0];

        return { id: target.id, email: target.email, name, role: target.role };
      },
    }),
    // Clients: Client ID (or email) + the password they set (once, with an emailed code).
    Credentials({
      id: "client-password",
      name: "Client password",
      credentials: {
        identifier: { label: "Client ID or email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw, request) {
        // `clientId` is the field name older cached pages still send.
        const parsed = z
          .object({
            identifier: z.string().min(1).max(160).optional(),
            clientId: z.string().min(1).max(160).optional(),
            password: z.string().min(1).max(200),
          })
          .refine((v) => v.identifier || v.clientId)
          .safeParse(raw);
        if (!parsed.success) return null;

        const client = await verifyPassword({
          identifierInput: (parsed.data.identifier ?? parsed.data.clientId)!,
          password: parsed.data.password,
          ip: requestIp(request),
        });
        if (!client) return null;
        return { id: client.userId, email: client.email, name: client.name, role: client.role };
      },
    }),
  ],
});

/**
 * The dashboards a login can open, from the profiles it owns (read from the
 * database on each dashboard load, so linking or approving another role shows
 * up without signing in again). One person can be a worker, an ambassador and
 * a client on the same login; the role they registered as comes first (their
 * default). Staff have none of these.
 */
export function portalsForUser(
  role: string,
  has: { worker: boolean; ambassador: boolean; client: boolean }
): Portal[] {
  const primary = primaryPortal(role);
  const found = (["worker", "ambassador", "client"] as const).filter((p) => has[p]);
  // An executive who is also an ambassador or worker (the Head of Growth kept
  // his own referral link) keeps that dashboard behind the switcher; staff
  // never hold client orders, so `client` is ignored for them.
  if (!primary) return isStaffRole(role) ? found.filter((p) => p !== "client") : [];
  return [primary, ...found.filter((p) => p !== primary)];
}

export type NavRoleFromUser = "admin" | "worker" | "ambassador" | "client";

export function navRoleForUser(role: string | undefined): NavRoleFromUser {
  switch (role) {
    case "WORKER":
      return "worker";
    case "AMBASSADOR":
      return "ambassador";
    case "CLIENT":
      return "client";
    default:
      return "admin";
  }
}

export const ROLE_LABELS: Record<string, string> = {
  ...EXEC_ROLE_LABELS,
  OPS_MANAGER: "Operations Manager",
  WORKER: "Worker",
  AMBASSADOR: "Ambassador",
  CLIENT: "Client",
};
