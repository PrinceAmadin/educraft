import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import { verifyPassword } from "@/lib/services/client-otp";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const user = await db.user.findUnique({
          where: { email: email.toLowerCase() },
          include: {
            workerProfile: { select: { fullName: true, status: true } },
            ambassadorProfile: { select: { fullName: true, status: true } },
            clientProfiles: { select: { fullName: true }, take: 1 },
          },
        });

        if (!user || !user.isActive) return null;
        // Clients use the client-password provider below (Client ID + their own password).
        if (user.role === "CLIENT") return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        // Explicit display name wins; then the role profile's own name; the
        // email local-part is a last resort, not a design.
        const name =
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
          portals: portalsForUser(user.role, Boolean(user.workerProfile), Boolean(user.ambassadorProfile)),
        };
      },
    }),
    // Clients: Client ID + the password they set (once, with an emailed code).
    Credentials({
      id: "client-password",
      name: "Client password",
      credentials: {
        clientId: { label: "Client ID", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw, request) {
        const parsed = z
          .object({ clientId: z.string().min(1).max(40), password: z.string().min(1).max(200) })
          .safeParse(raw);
        if (!parsed.success) return null;

        const forwarded = request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
        const ip = forwarded || request?.headers?.get("x-real-ip") || "unknown";

        const client = await verifyPassword({ clientIdInput: parsed.data.clientId, password: parsed.data.password, ip });
        if (!client) return null;
        return { id: client.userId, email: client.email, name: client.name, role: "CLIENT" };
      },
    }),
  ],
});

/**
 * The dashboards a login can open. One person can be a worker AND an ambassador
 * on the same login; the role they registered as comes first (their default).
 * Staff and clients have none of these.
 */
export function portalsForUser(role: string, hasWorker: boolean, hasAmbassador: boolean): string[] {
  if (role !== "WORKER" && role !== "AMBASSADOR") return [];
  const found = [hasWorker && "worker", hasAmbassador && "ambassador"].filter(Boolean) as string[];
  const primary = role.toLowerCase();
  if (!found.includes(primary)) found.unshift(primary);
  return [primary, ...found.filter((p) => p !== primary)];
}

/** Landing route for each role after sign-in. */
export function homeForRole(role: string | undefined) {
  switch (role) {
    case "SUPER_ADMIN":
    case "OPS_MANAGER":
      return "/admin";
    case "WORKER":
      return "/worker";
    case "AMBASSADOR":
      return "/ambassador";
    case "CLIENT":
      return "/client";
    default:
      return "/";
  }
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
  SUPER_ADMIN: "Super Admin",
  OPS_MANAGER: "Operations Manager",
  WORKER: "Worker",
  AMBASSADOR: "Ambassador",
  CLIENT: "Client",
};
