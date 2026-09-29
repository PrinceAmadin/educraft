import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { GeneralSettingsForm } from "@/components/settings/GeneralSettingsForm";
import { OperationsTimingForm } from "@/components/operations/OperationsTimingForm";
import { getGeneralSettings } from "@/lib/services/settings";
import { getExpectedHours } from "@/lib/services/operations/pipeline";
import { getAlertRoleRecipients } from "@/lib/services/team-alerts";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [session, settings, expected, alertRoles] = await Promise.all([
    auth(),
    getGeneralSettings(),
    getExpectedHours(),
    getAlertRoleRecipients(),
  ]);
  const canEditPricing = session?.user?.role === "SUPER_ADMIN";

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Company details, service catalogue, team access and bank details.
        </p>
      </div>

      <SettingsTabs active="general" role={session?.user?.role} />

      <GeneralSettingsForm settings={settings} canEditPricing={canEditPricing} alertRoles={alertRoles} />

      {canEditPricing ? <OperationsTimingForm hours={expected} /> : null}
    </div>
  );
}
