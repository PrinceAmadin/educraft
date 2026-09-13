import type { Metadata } from "next";
import Link from "next/link";
import { LuInbox, LuUsers } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { getAmbassadorByUserId, listReferrals } from "@/lib/services/ambassador-portal";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/projects/StatusBadge";
import { referralFilterSchema } from "@/lib/validations/ambassador";
import { cn, formatDate, formatNaira } from "@/lib/utils";
import type { ProjectStatus } from "@prisma/client";

export const metadata: Metadata = { title: "My referrals" };
export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "converted", label: "Converted" },
  { key: "pending", label: "Pending" },
] as const;

export default async function AmbassadorReferralsPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const session = await auth();
  const ambassador = session?.user ? await getAmbassadorByUserId(session.user.id) : null;
  if (!ambassador) {
    return <EmptyState icon={LuInbox} title="No ambassador profile" description="Contact an admin." />;
  }

  const { filter } = referralFilterSchema.parse(searchParams);
  const active = filter ?? "all";
  const rows = await listReferrals(ambassador.id, active);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">My referrals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone who signed up with your code. A referral converts once they place a project.
        </p>
      </div>

      <div className="flex gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/ambassador/referrals" : `/ambassador/referrals?filter=${f.key}`}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              active === f.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={LuUsers}
          title={active === "all" ? "No referrals yet" : `No ${active} referrals`}
          description="Share your link to start bringing clients in."
        />
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {rows.map((r) => (
              <li key={r.id} className="surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{r.clientName}</span>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-xs font-medium",
                      r.converted
                        ? "border-transparent bg-success/15 text-success"
                        : "border-border bg-elevated text-muted-foreground"
                    )}
                  >
                    {r.converted ? "Converted" : "Pending"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Joined {formatDate(r.joinedAt)}
                  {r.latestService ? ` · ${r.latestService}` : ""}
                </p>
                {r.converted ? (
                  <p className="mt-1 font-mono text-xs text-foreground">
                    {formatNaira(r.commissionEarned)} commission
                  </p>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-left text-[13px] text-muted-foreground">
                  <th className="px-3 py-2.5">Joined</th>
                  <th className="px-3 py-2.5">Client</th>
                  <th className="px-3 py-2.5">Service</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Converted</th>
                  <th className="px-3 py-2.5 text-right">Commission</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-3 text-muted-foreground">{formatDate(r.joinedAt)}</td>
                    <td className="px-3 py-3 text-foreground">{r.clientName}</td>
                    <td className="px-3 py-3 text-muted-foreground">{r.latestService ?? "—"}</td>
                    <td className="px-3 py-3">
                      {r.latestStatus ? (
                        <StatusBadge status={r.latestStatus as ProjectStatus} short />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {r.converted ? (
                        <span className="text-success">Yes</span>
                      ) : (
                        <span className="text-muted-foreground">No</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {r.converted ? formatNaira(r.commissionEarned) : "—"}
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
