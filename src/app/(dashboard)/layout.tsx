import { redirect } from "next/navigation";
import { auth, navRoleForUser, ROLE_LABELS } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { MobileNav } from "@/components/layout/MobileNav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = navRoleForUser(session.user.role);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar role={role} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          role={role}
          name={session.user.name ?? "EduCraft"}
          email={session.user.email ?? ""}
          roleLabel={ROLE_LABELS[session.user.role] ?? "Member"}
        />

        {/* pb-24 clears the fixed mobile bottom nav */}
        <main className="flex-1 px-4 pb-24 pt-6 md:px-6 md:pb-10 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>

      <MobileNav role={role} />
    </div>
  );
}
