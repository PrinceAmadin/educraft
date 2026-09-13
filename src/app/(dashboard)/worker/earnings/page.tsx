import type { Metadata } from "next";
import { LuInbox, LuWallet } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { getWorkerByUserId, getWorkerEarnings } from "@/lib/services/worker-portal";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/projects/StatusBadge";
import { formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "Earnings" };
export const dynamic = "force-dynamic";

export default async function WorkerEarningsPage() {
  const session = await auth();
  const worker = session?.user ? await getWorkerByUserId(session.user.id) : null;
  if (!worker) {
    return <EmptyState icon={LuInbox} title="No worker profile" description="Contact an admin." />;
  }

  const { totalEarned, totalPaid, balance, rows } = await getWorkerEarnings(worker.id);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Earnings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your 40% payout, per project.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Total earned" value={formatNaira(totalEarned)} />
        <Stat label="Total paid" value={formatNaira(totalPaid)} />
        <Stat label="Balance" value={formatNaira(balance)} strong />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={LuWallet} title="No earnings yet" description="Payouts show up here as projects complete." />
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {rows.map((r) => (
              <li key={r.projectId} className="surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-medium text-foreground">{r.projectId}</span>
                  <StatusBadge status={r.status} short />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{r.serviceName}</p>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="font-mono text-foreground">{formatNaira(r.amount)}</span>
                  <span className={r.paid ? "text-success" : "text-muted-foreground"}>
                    {r.paid ? "Paid" : r.status === "COMPLETED" ? "Pending" : "Not yet due"}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Project</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Payout</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.projectId}>
                    <TableCell className="font-mono text-sm font-medium text-foreground">
                      {r.projectId}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.serviceName}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} short />
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatNaira(r.amount)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.paid ? (
                        <span className="text-success">Paid</span>
                      ) : r.status === "COMPLETED" ? (
                        <span className="text-gold">Pending</span>
                      ) : (
                        <span className="text-muted-foreground">Not yet due</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
      <p className={`mt-1 font-mono text-lg font-medium tabular-nums ${strong ? "text-foreground" : "text-muted-foreground"}`}>
        {value}
      </p>
    </div>
  );
}
