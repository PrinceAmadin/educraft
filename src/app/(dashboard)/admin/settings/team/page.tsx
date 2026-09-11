import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { TeamManager } from "@/components/settings/TeamManager";
import { listTeam } from "@/lib/services/team";

export const metadata: Metadata = { title: "Team" };
export const dynamic = "force-dynamic";

export default async function TeamSettingsPage() {
  const [session, team] = await Promise.all([auth(), listTeam()]);
  const canManage = session?.user?.role === "SUPER_ADMIN";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Company details, service catalogue, and team access.
        </p>
      </div>

      <SettingsTabs active="team" />

      <div>
        <h2 className="text-lg font-semibold text-foreground">Team</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Admin accounts with access to this dashboard — Super Admin or Ops Manager.
        </p>
        {!canManage ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Only the founder (Super Admin) can add or deactivate admin accounts.
          </p>
        ) : null}
        <div className="mt-4">
          <TeamManager team={team} canManage={canManage} currentUserId={session?.user?.id ?? ""} />
        </div>
      </div>
    </div>
  );
}
