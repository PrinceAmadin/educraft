import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { GeneralSettingsForm } from "@/components/settings/GeneralSettingsForm";
import { getGeneralSettings } from "@/lib/services/settings";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [session, settings] = await Promise.all([auth(), getGeneralSettings()]);
  const canEditPricing = session?.user?.role === "SUPER_ADMIN";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Company details, service catalogue, and team access.
        </p>
      </div>

      <SettingsTabs active="general" />

      <GeneralSettingsForm settings={settings} canEditPricing={canEditPricing} />
    </div>
  );
}
