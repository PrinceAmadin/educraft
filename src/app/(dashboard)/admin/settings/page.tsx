import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { GeneralSettingsForm } from "@/components/settings/GeneralSettingsForm";
import { ClaudeApiKeyCard } from "@/components/settings/ClaudeApiKeyCard";
import { OperationsTimingForm } from "@/components/operations/OperationsTimingForm";
import { getGeneralSettings } from "@/lib/services/settings";
import { getExpectedHours } from "@/lib/services/operations/pipeline";
import { getAlertRoleRecipients } from "@/lib/services/team-alerts";
import { getAnthropicKeyStatus } from "@/lib/anthropic-key";
import { deliveredProjectCount } from "@/lib/services/marketing-stats";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [session, settings, expected, alertRoles, anthropicKey, deliveredInHq] = await Promise.all([
    auth(),
    getGeneralSettings(),
    getExpectedHours(),
    getAlertRoleRecipients(),
    getAnthropicKeyStatus(),
    // Shown beside the stated homepage figure, so the gap between what the
    // page claims and what HQ can prove is visible where it is edited.
    deliveredProjectCount().catch(() => null),
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

      <GeneralSettingsForm
        settings={settings}
        canEditPricing={canEditPricing}
        alertRoles={alertRoles}
        deliveredInHq={deliveredInHq}
      />

      {/* Deliberately a sibling of the form, not a field in it: the key needs its own
          validating route, and staying out of generalSettingsSchema and the settings
          KEYS registry means getGeneralSettings() can never return it. */}
      {canEditPricing ? <ClaudeApiKeyCard status={anthropicKey} canEdit /> : null}

      {canEditPricing ? <OperationsTimingForm hours={expected} /> : null}
    </div>
  );
}
