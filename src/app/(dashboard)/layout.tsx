import { redirect } from "next/navigation";
import { auth, navRoleForUser, portalsForUser, ROLE_LABELS } from "@/lib/auth";
import { db } from "@/lib/db";
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

  // Worker / ambassador logins can own both profiles: ask the database which, so a
  // newly linked or approved second role appears without a fresh sign-in.
  let portals: NavRole[] = [role];
  if (session.user.role === "WORKER" || session.user.role === "AMBASSADOR") {
    const profiles = await db.user.findUnique({
      where: { id: session.user.id },
      select: { workerProfile: { select: { status: true } }, ambassadorProfile: { select: { status: true } } },
    });
    const found = portalsForUser(
      session.user.role,
      profiles?.workerProfile ? isWorkerOpen(profiles.workerProfile.status) : false,
      profiles?.ambassadorProfile ? profiles.ambassadorProfile.status === "Active" : false
    ) as NavRole[];
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
