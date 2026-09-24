import { redirect } from "next/navigation";
import { auth, navRoleForUser, portalsForUser, ROLE_LABELS } from "@/lib/auth";
import { db } from "@/lib/db";
import { isPersonRole, isStaffRole } from "@/lib/roles";
import { linkClientOrders } from "@/lib/services/account-links";
import { DashboardShell } from "@/components/layout/DashboardShell";
import type { NavRole } from "@/lib/constants";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = navRoleForUser(session.user.role);

  // An executive is greeted by the name on their record, read fresh so a
  // correction on Team & Roles shows without signing in again.
  let name = session.user.name ?? "EduCraft";
  if (isStaffRole(session.user.role)) {
    const exec = await db.execProfile.findUnique({ where: { userId: session.user.id }, select: { fullName: true } });
    if (exec) name = exec.fullName;
  }

  // One person can be a worker, an ambassador and a client on the same login: ask
  // the database which, so a newly linked or approved role appears without a
  // fresh sign-in. The switcher offers each one they hold in good standing.
  let portals: NavRole[] = [role];
  if (isStaffRole(session.user.role)) {
    // An executive who is also an ambassador or worker keeps that dashboard.
    const profiles = await db.user.findUnique({
      where: { id: session.user.id },
      select: { workerProfile: { select: { status: true } }, ambassadorProfile: { select: { status: true } } },
    });
    const extra = portalsForUser(session.user.role, {
      worker: profiles?.workerProfile ? isWorkerOpen(profiles.workerProfile.status) : false,
      ambassador: profiles?.ambassadorProfile ? profiles.ambassadorProfile.status === "Active" : false,
      client: false,
    });
    portals = ["admin", ...extra];
  } else if (isPersonRole(session.user.role)) {
    // The email is the person: any order placed with it since the last visit joins
    // this login now, so its client dashboard appears without signing in again.
    const me = await db.user.findUnique({ where: { id: session.user.id }, select: { email: true, isActive: true } });
    if (me?.isActive) await linkClientOrders(session.user.id, me.email);
    const profiles = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        workerProfile: { select: { status: true } },
        ambassadorProfile: { select: { status: true } },
        _count: { select: { clientProfiles: true } },
      },
    });
    const found = portalsForUser(session.user.role, {
      worker: profiles?.workerProfile ? isWorkerOpen(profiles.workerProfile.status) : false,
      ambassador: profiles?.ambassadorProfile ? profiles.ambassadorProfile.status === "Active" : false,
      client: (profiles?._count.clientProfiles ?? 0) > 0,
    });
    if (found.length) portals = found;
  }

  return (
    <DashboardShell
      defaultRole={role}
      portals={portals}
      userRole={session.user.role}
      name={name}
      email={session.user.email ?? ""}
      roleLabel={ROLE_LABELS[session.user.role] ?? "Member"}
    >
      {children}
    </DashboardShell>
  );
}

function isWorkerOpen(status: string) {
  return status === "Active" || status === "On Break";
}
