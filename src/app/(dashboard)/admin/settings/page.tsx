import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { GeneralSettingsForm } from "@/components/settings/GeneralSettingsForm";
import { usdToNairaRate } from "@/lib/ai-usage-log";
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
          Company details, service catalogue, team access and bank details.
        </p>
      </div>

      <SettingsTabs active="general" role={session?.user?.role} />

      <GeneralSettingsForm settings={settings} canEditPricing={canEditPricing} />

      <section className="max-w-3xl">
        <h2 className="text-[15px] font-semibold text-foreground">Claude exchange rate</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          AI usage costs convert from US dollars at{" "}
          <span className="font-mono text-foreground">₦{usdToNairaRate().toLocaleString("en-NG")}</span> per $1
          {process.env.USD_NGN_RATE ? "" : " (default; USD_NGN_RATE is not set)"}. To change it, set{" "}
          <span className="font-mono">USD_NGN_RATE</span> in Vercel, then redeploy. It applies to calls logged after
          the change; earlier calls keep the rate they were logged at.
        </p>
      </section>
    </div>
  );
}
