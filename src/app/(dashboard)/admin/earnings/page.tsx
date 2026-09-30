import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LuCircleCheck, LuClock, LuCoins, LuWallet } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { canAccessRoute, effectiveRole, homeForRole } from "@/lib/rbac";
import { PageHeader } from "@/components/shared/PageHeader";
import { CadenceNotice } from "@/components/shared/CadenceNotice";
import { StatsCard, STATS_GRID } from "@/components/dashboard/StatsCard";
import { getExecutiveEarnings, type ExecutiveEarnings } from "@/lib/services/finance/executive-earnings";
import type { ExecRecipient } from "@/lib/services/finance/payouts-engine";
import { formatDate, formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "My earnings" };
export const dynamic = "force-dynamic";

/**
 * Each earning executive's own commissions and bonuses, from the payout ledger.
 * The HOG and COO see their own; the founder (who has no commission leg) sees
 * both, for oversight.
 */
export default async function ExecutiveEarningsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = effectiveRole(session.user.role);
  if (!canAccessRoute(session.user.role, "/admin/earnings")) redirect(homeForRole(role));

  const roles: ExecRecipient[] = role === "HOG" || role === "COO" ? [role] : ["HOG", "COO"];
  const sections = await Promise.all(roles.map((r) => getExecutiveEarnings(r)));

  return (
    <div className="space-y-10">
      <PageHeader
        title="My earnings"
        description="Your commission and performance bonuses, what is owed and what has been paid."
      />
      <CadenceNotice>Commission and bonuses are paid on the last Friday of each month, to the bank account on your profile.</CadenceNotice>
      {sections.map((s) => (
        <EarningsSection key={s.role} data={s} showName={roles.length > 1} />
      ))}
    </div>
  );
}

function EarningsSection({ data, showName }: { data: ExecutiveEarnings; showName: boolean }) {
  return (
    <section className="space-y-5">
      {showName ? <h2 className="text-lg font-semibold tracking-tight text-foreground">{data.name}</h2> : null}
      <div className={STATS_GRID}>
        <StatsCard label="Owed this month" value={formatNaira(data.owedThisMonth)} icon={LuClock} tone="gold" />
        <StatsCard label="Outstanding balance" value={formatNaira(data.balance)} icon={LuWallet} tone="primary" detail="owed but not yet paid" />
        <StatsCard label="Paid to date" value={formatNaira(data.lifetimePaid)} icon={LuCircleCheck} tone="success" />
        <StatsCard label="Earned to date" value={formatNaira(data.lifetimeOwed)} icon={LuCoins} tone="primary" />
      </div>

      {data.months.length === 0 ? (
        <p className="rounded-2xl bg-zone px-5 py-6 text-sm text-muted-foreground">No commission or bonuses yet.</p>
      ) : (
        <div className="space-y-6">
          <div>
            <p className="meta-label mb-2">By month</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Month</th>
                    <th className="py-2 pr-4 text-right font-medium">Commission</th>
                    <th className="py-2 pr-4 text-right font-medium">Bonus</th>
                    <th className="py-2 pr-4 text-right font-medium">Owed</th>
                    <th className="py-2 pr-4 text-right font-medium">Paid</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.months.map((m) => (
                    <tr key={m.month} className="border-b border-border/60">
                      <td className="py-2 pr-4 text-foreground">{m.label}</td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums">{formatNaira(m.commission)}</td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums">{m.bonus ? formatNaira(m.bonus) : "—"}</td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums text-foreground">{formatNaira(m.owed)}</td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums">{formatNaira(m.paid)}</td>
                      <td className="py-2">
                        <span className={m.status === "PAID" ? "text-success" : m.status === "PARTLY" ? "text-gold" : "text-muted-foreground"}>
                          {m.status === "PAID" ? "Paid" : m.status === "PARTLY" ? "Part-paid" : "Awaiting payout"}
                        </span>
                        {m.paidAt ? <span className="ml-2 text-xs text-muted-foreground">{formatDate(m.paidAt)}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
