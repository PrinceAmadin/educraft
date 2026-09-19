import type { Metadata } from "next";
import { LuInbox, LuWallet } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { getAmbassadorByUserId, getAmbassadorCommissions } from "@/lib/services/ambassador-portal";
import { getOwnPerformance } from "@/lib/services/ambassador-analytics";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/projects/StatusBadge";
import { formatDate, formatNaira } from "@/lib/utils";
import type { ProjectStatus } from "@prisma/client";

export const metadata: Metadata = { title: "Commissions" };
export const dynamic = "force-dynamic";

export default async function AmbassadorCommissionsPage() {
  const session = await auth();
  const ambassador = session?.user ? await getAmbassadorByUserId(session.user.id) : null;
  if (!ambassador) {
    return <EmptyState icon={LuInbox} title="No ambassador profile" description="Contact an admin." />;
  }

  const [{ totalEarned, totalPaid, balance, rows }, perf] = await Promise.all([
    getAmbassadorCommissions(ambassador.id),
    getOwnPerformance(ambassador.id),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Commissions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Earned when a completed project settles. Paid out from the payout queue.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Total earned" value={formatNaira(totalEarned)} />
        <Stat label="Total paid" value={formatNaira(totalPaid)} />
        <Stat label="Balance" value={formatNaira(balance)} strong />
      </div>

      {/* Private to you: never shown on the leaderboard. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Orders" value={perf.orders.toLocaleString("en-NG")} />
        <Stat label="Unique visitors" value={perf.uniqueVisitors.toLocaleString("en-NG")} />
        <Stat label="Conversion" value={perf.conversion === null ? "-" : `${perf.conversion}%`} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={LuWallet}
          title="No commissions yet"
          description="Commissions appear here as your referred projects progress."
        />
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {rows.map((r) => (
              <li key={r.projectId} className="surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-medium text-foreground">{r.projectId}</span>
                  <StatusBadge status={r.status as ProjectStatus} short />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {r.clientName}
                  {r.rate != null ? ` · ${r.rate}%` : ""}
                </p>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="font-mono text-foreground">{formatNaira(r.amount)}</span>
                  <span className={r.paid ? "text-success" : "text-muted-foreground"}>
                    {r.paid
                      ? `Paid${r.paidOn ? ` ${formatDate(r.paidOn)}` : ""}`
                      : r.status === "COMPLETED"
                        ? "Pending"
                        : "Not yet due"}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-left text-[13px] text-muted-foreground">
                  <th className="px-3 py-2.5">Project</th>
                  <th className="px-3 py-2.5">Client</th>
                  <th className="px-3 py-2.5 text-right">Rate</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                  <th className="px-3 py-2.5">Earned</th>
                  <th className="px-3 py-2.5">Paid</th>
                  <th className="px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.projectId}>
                    <td className="px-3 py-3 font-mono font-medium text-foreground">{r.projectId}</td>
                    <td className="px-3 py-3 text-foreground">{r.clientName}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {r.rate != null ? `${r.rate}%` : "—"}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {formatNaira(r.amount)}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {r.earnedOn ? formatDate(r.earnedOn) : "—"}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {r.paidOn ? formatDate(r.paidOn) : "—"}
                    </td>
                    <td className="px-3 py-3 text-sm">
                      {r.paid ? (
                        <span className="text-success">Paid</span>
                      ) : r.status === "COMPLETED" ? (
                        <span className="text-gold">Pending</span>
                      ) : (
                        <span className="text-muted-foreground">Accruing</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl bg-zone p-3 sm:p-4">
      <p className="meta-label">{label}</p>
      <p
        className={`mt-1 font-mono text-lg font-medium tabular-nums ${
          strong ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
