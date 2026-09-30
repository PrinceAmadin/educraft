import { db } from "@/lib/db";
import { EXEC_ROLE_LABELS, isExecRole } from "@/lib/rbac";

export interface StaffOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

/**
 * The logins a custom person row of the cashflow structure can be assigned
 * to: every active staff login (executives), so a "Growth Associate" or any
 * new recipient the founder adds pays one real person.
 */
export async function listStaffForAssignment(): Promise<StaffOption[]> {
  const users = await db.user.findMany({
    where: { isActive: true, role: { in: ["SUPER_ADMIN", "CO_CEO_CFO", "HOG", "COO"] } },
    select: { id: true, email: true, displayName: true, role: true, execProfile: { select: { fullName: true } } },
    orderBy: { createdAt: "asc" },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.execProfile?.fullName ?? u.displayName ?? u.email,
    email: u.email,
    role: isExecRole(u.role) ? EXEC_ROLE_LABELS[u.role] : u.role,
  }));
}
