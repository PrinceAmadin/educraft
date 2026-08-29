import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";

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
            workerProfile: { select: { fullName: true } },
            ambassadorProfile: { select: { fullName: true } },
            clientProfile: { select: { fullName: true } },
          },
        });

        if (!user || !user.isActive) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        // Explicit display name wins; then the role profile's own name; the
        // email local-part is a last resort, not a design.
        const name =
          user.displayName ??
          user.workerProfile?.fullName ??
          user.ambassadorProfile?.fullName ??
          user.clientProfile?.fullName ??
          user.email.split("@")[0];

        return {
          id: user.id,
          email: user.email,
          name,
          role: user.role,
        };
      },
    }),
  ],
});

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
    default:
      return "/";
  }
}

export type NavRoleFromUser = "admin" | "worker" | "ambassador";

export function navRoleForUser(role: string | undefined): NavRoleFromUser {
  switch (role) {
    case "WORKER":
      return "worker";
    case "AMBASSADOR":
      return "ambassador";
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
