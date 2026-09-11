import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { ServiceCatalogManager } from "@/components/settings/ServiceCatalogManager";
import { listServices } from "@/lib/services/service-catalog";

export const metadata: Metadata = { title: "Services" };
export const dynamic = "force-dynamic";

export default async function ServiceSettingsPage() {
  const [session, services] = await Promise.all([auth(), listServices()]);
  const canManage = session?.user?.role === "SUPER_ADMIN";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Company details, service catalogue, and team access.
        </p>
      </div>

      <SettingsTabs active="services" />

      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Services</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              What clients can order at <span className="font-mono">/services</span> and{" "}
              <span className="font-mono">/intake</span>. Deactivate instead of deleting — projects keep
              referencing the service they were priced against.
            </p>
          </div>
        </div>
        {!canManage ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Only the founder (Super Admin) can add, edit, or deactivate services.
          </p>
        ) : null}
        <div className="mt-4">
          <ServiceCatalogManager services={services} canManage={canManage} />
        </div>
      </div>
    </div>
  );
}
