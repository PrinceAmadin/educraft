import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { homeForRole } from "@/lib/rbac";
import { isStaffRole } from "@/lib/roles";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { BankDetailsForm } from "@/components/settings/BankDetailsForm";
import { getBankDetails, listBankDetails } from "@/lib/services/team";

export const metadata: Metadata = { title: "Bank details" };
export const dynamic = "force-dynamic";

/**
 * Where each executive's payouts and draws are sent. Every executive sees and
 * edits only their own; the Super Admin sees and edits everyone's.
 */
export default async function BankDetailsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isStaffRole(session.user.role)) redirect(homeForRole(session.user.role));

  const isSuperAdmin = session.user.role === "SUPER_ADMIN";
  const rows = isSuperAdmin ? await listBankDetails() : [await getBankDetails(session.user.id)].filter((r) => r !== null);
  // The founder's own account first, then the executives.
  const ordered = isSuperAdmin ? [...rows].sort((a, b) => Number(b.userId === session.user.id) - Number(a.userId === session.user.id)) : rows;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isSuperAdmin ? "Company details, service catalogue, team access and bank details." : "Your bank details for payouts and draws."}
        </p>
      </div>

      <SettingsTabs active="bank" role={session.user.role} />

      <div>
        <h2 className="text-lg font-semibold text-foreground">Bank details</h2>
        <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">
          {isSuperAdmin
            ? "Every executive's payout account. Each executive can see and edit only their own; the Finance Platform will pay commissions and draws to these."
            : "Where your commissions and draws are sent. Only you and the Super Admin can see this."}
        </p>

        {ordered.length === 0 ? (
          <p className="mt-5 text-sm text-muted-foreground">No executive record is linked to this login yet. Ask the Super Admin to add you on Team &amp; roles.</p>
        ) : (
          <div className="mt-6 space-y-10">
            {ordered.map((row) => (
              <BankDetailsForm key={row.userId} row={row} isSelf={row.userId === session.user.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
