import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { homeForRole } from "@/lib/rbac";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { TeamRoles } from "@/components/settings/TeamRoles";
import { listExecutives } from "@/lib/services/team";

export const metadata: Metadata = { title: "Team & roles" };
export const dynamic = "force-dynamic";

/** Who holds which executive role. Founder only: the middleware, the admin layout and this page all check. */
export default async function TeamRolesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "SUPER_ADMIN") redirect(homeForRole(session.user.role));

  const executives = await listExecutives();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Company details, service catalogue, team access and bank details.</p>
      </div>

      <SettingsTabs active="team" role={session.user.role} />

      <div>
        <h2 className="text-lg font-semibold text-foreground">Team &amp; roles</h2>
        <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">
          The executives who can open HQ and what each one sees. The CFO gets Finance, the Head of Growth gets Ambassadors
          and Growth, the COO gets Projects, QA and Workers; only the Super Admin sees everything and can change who holds
          what.
        </p>
        <div className="mt-5">
          <TeamRoles executives={executives} currentUserId={session.user.id} />
        </div>
      </div>
    </div>
  );
}
