import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccessRoute, homeForRole } from "@/lib/rbac";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { CashflowEditor } from "@/components/settings/cashflow/CashflowEditor";
import { AuditHistory } from "@/components/settings/cashflow/AuditHistory";
import { getActiveCashflowOrNull, level1KeysWithRecords, listCashflowAudit, listCashflowVersions, minServiceDownpayment } from "@/lib/services/cashflow";
import { listStaffForAssignment } from "@/lib/services/cashflow-staff";

export const metadata: Metadata = { title: "EduCraft Cashflow" };
export const dynamic = "force-dynamic";

/**
 * The commission and bucket structure: the founder edits and publishes a
 * new version; the CFO, COO and HOG read it (founder, 30 Sept 2026).
 */
export default async function CashflowSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canAccessRoute(session.user.role, "/admin/settings/cashflow")) redirect(homeForRole(session.user.role));
  const readOnly = session.user.role !== "SUPER_ADMIN";
  // The audit trail is the founder's and the CFO's (matrix: "Audit log read = CEO, CFO").
  const canSeeAudit = session.user.role === "SUPER_ADMIN" || session.user.role === "CO_CEO_CFO";

  const [active, history, keysWithRecords, minDownpayment, staff, audit] = await Promise.all([
    getActiveCashflowOrNull(),
    listCashflowVersions(),
    level1KeysWithRecords(),
    minServiceDownpayment(),
    listStaffForAssignment(),
    canSeeAudit ? listCashflowAudit() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Company details, service catalogue, team access and bank details.</p>
      </div>

      <SettingsTabs active="cashflow" role={session.user.role} />

      <div>
        <h2 className="text-lg font-semibold text-foreground">EduCraft Cashflow</h2>
        <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
          {readOnly
            ? "How every project's money is shared: who earns what, which buckets EduCraft's share fills, the ambassador tiers and the founder draws. Only the Super Admin can change it; this is the version in force."
            : "How every project's money is shared. Each level must add up to 100%. Saving publishes a new version: projects created from then on use it, and every existing project keeps the version it was created under."}
        </p>
      </div>

      {active ? (
        <CashflowEditor active={active} history={history} staff={staff} keysWithRecords={keysWithRecords} minServiceDownpayment={minDownpayment} readOnly={readOnly} />
      ) : (
        <p className="rounded-2xl bg-zone px-5 py-6 text-sm text-muted-foreground">
          No cashflow version has been published yet. Run <code className="font-mono">npm run cashflow:seed -- --apply</code> to publish version 1 (the manual&apos;s numbers).
        </p>
      )}

      {canSeeAudit ? <AuditHistory entries={audit} /> : null}
    </div>
  );
}
