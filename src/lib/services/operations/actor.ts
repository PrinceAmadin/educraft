import { db } from "@/lib/db";
import { effectiveRole } from "@/lib/rbac";

/** Who is doing an operations action, for notes and review records. */
export interface Actor {
  userId: string;
  name: string;
  /** The effective staff role (OPS_MANAGER reads as COO). */
  role: string;
}

/** The executive's name from their record, else the login's display name, else the email. */
export async function actorFor(session: { userId: string; role: string }): Promise<Actor> {
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { displayName: true, email: true, execProfile: { select: { fullName: true } } },
  });
  return {
    userId: session.userId,
    name: user?.execProfile?.fullName ?? user?.displayName ?? user?.email ?? "Admin",
    role: effectiveRole(session.role),
  };
}
