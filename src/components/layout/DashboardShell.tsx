"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { MobileNav } from "@/components/layout/MobileNav";
import { OfflineBanner } from "@/components/pwa/OfflineBanner";
import { PwaBanner } from "@/components/pwa/PwaBanner";
import type { NavRole } from "@/lib/constants";

interface DashboardShellProps {
  /** The dashboard this login lands on by default. */
  defaultRole: NavRole;
  /** Every dashboard this login can open (more than one for a person who is, say, a worker and a client). */
  portals: NavRole[];
  name: string;
  email: string;
  roleLabel: string;
  children: React.ReactNode;
}

const PORTAL_ROLE_LABELS: Partial<Record<NavRole, string>> = { worker: "Worker", ambassador: "Ambassador", client: "Client" };

/**
 * Chooses the sidebar and nav from the URL, so one login can move between its
 * worker, ambassador and client dashboards (the account menu switches).
 */
export function DashboardShell({ defaultRole, portals, name, email, roleLabel, children }: DashboardShellProps) {
  const pathname = usePathname();
  const role = portals.find((p) => pathname === `/${p}` || pathname.startsWith(`/${p}/`)) ?? defaultRole;
  // With more than one dashboard, the badge names the one on screen.
  const label = portals.length > 1 ? PORTAL_ROLE_LABELS[role] ?? roleLabel : roleLabel;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar role={role} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar role={role} portals={portals} name={name} email={email} roleLabel={label} />

        {/* pb-24 clears the fixed mobile bottom nav */}
        <main className="flex-1 px-4 pb-24 pt-6 md:px-6 md:pb-10 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px]">
            <OfflineBanner />
            <PwaBanner />
            {children}
          </div>
        </main>
      </div>

      <MobileNav role={role} />
    </div>
  );
}
