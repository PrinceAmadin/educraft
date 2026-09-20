import { redirect } from "next/navigation";
import { auth, navRoleForUser, ROLE_LABELS } from "@/lib/auth";
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
  const portals = (session.user.portals?.length ? session.user.portals : [role]) as NavRole[];

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
