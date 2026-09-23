import { redirect } from "next/navigation";
import { auth, navRoleForUser, portalsForUser, ROLE_LABELS } from "@/lib/auth";
import { db } from "@/lib/db";
import { isPersonRole } from "@/lib/roles";
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

  // One person can be a worker, an ambassador and a client on the same login: ask
  // the database which, so a newly linked or approved role appears without a
  // fresh sign-in. The switcher offers each one they hold in good standing.
  let portals: NavRole[] = [role];
  if (isPersonRole(session.user.role)) {
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
      name={session.user.name ?? "EduCraft"}
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
