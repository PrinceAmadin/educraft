import type { Metadata } from "next";
import { LuHandshake } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shared/PageHeader";
import { AmbassadorTabs } from "@/components/ambassadors/AmbassadorTabs";
import { HogBudgetPanel } from "@/components/finance/HogBudgetPanel";
import { EmptyState } from "@/components/shared/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AddPartnershipButton, PartnershipView, RenewPartnershipButton } from "@/components/ambassadors/platform/partnerships/PartnershipActions";
import { listPartnerships, type PartnershipDisplayStatus, type PartnershipRow } from "@/lib/services/ambassador-platform/partnerships";
import { getHogBudget } from "@/lib/services/expenses";
import { currentMonthKey } from "@/lib/services/finance/surplus";
import { cn, formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "Partnerships" };
export const dynamic = "force-dynamic";

const STATUS: Record<PartnershipDisplayStatus, { label: string; className: string }> = {
  ACTIVE: { label: "Active", className: "bg-success/15 text-success" },
  DUE_RENEWAL: { label: "Due renewal", className: "bg-gold/15 text-gold" },
  RENEWAL_OVERDUE: { label: "Renewal overdue", className: "bg-danger/10 text-danger" },
  IN_NEGOTIATION: { label: "In negotiation", className: "bg-info/15 text-info" },
  INACTIVE: { label: "Inactive", className: "bg-zone text-muted-foreground" },
};

function monthYear(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** Phase 3 Section 6 — Partnerships: student unions and faculty associations, paid from the Growth Fund. */
export default async function PartnershipsPage() {
  const [session, rows, budget, universities, ambassadors, pendingApplications] = await Promise.all([
    auth(),
    listPartnerships(),
    getHogBudget(currentMonthKey()),
    db.university.findMany({ orderBy: { abbreviation: "asc" }, select: { abbreviation: true, name: true } }),
    db.ambassador.findMany({ where: { status: { not: "Terminated" } }, orderBy: { fullName: "asc" }, select: { id: true, ambassadorId: true, fullName: true } }),
    db.ambassadorApplication.count({ where: { status: "PENDING" } }),
  ]);
  const isFounder = session?.user?.role === "SUPER_ADMIN";
  const common = { schools: universities, isFounder, ambassadors };

  return (
    <div className="space-y-7">
      <PageHeader
        title="Partnerships"
        description="Student unions and faculty associations EduCraft works with. What we commit is paid from the Growth Fund against the quarter's budget."
        actions={<div className="flex flex-wrap items-center justify-end gap-2"><AddPartnershipButton schools={universities} isFounder={isFounder} /></div>}
      />
      <AmbassadorTabs active="partnerships" pendingApplications={pendingApplications} />

      <HogBudgetPanel budget={budget} title="Growth Fund — HOG partnership budget" showApprovalRule />

      <section aria-labelledby="partnerships-heading" className="space-y-3">
        <h2 id="partnerships-heading" className="text-[15px] font-semibold text-foreground">
          Partnerships <span className="ml-1 font-mono text-xs text-muted-foreground">{rows.length}</span>
        </h2>
        {rows.length === 0 ? (
          <EmptyState icon={LuHandshake} title="No partnerships yet" description="Add the first student union or faculty association EduCraft works with." className="py-10" />
        ) : (
          <>
            <ul className="space-y-3 md:hidden">
              {rows.map((p) => (
                <li key={p.id} className="surface p-4 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 font-medium text-foreground">{p.organisationName}</p>
                    <StatusPill status={p.displayStatus} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {p.school}
                    {p.faculty ? ` · ${p.faculty}` : ""}
                  </p>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <dt className="meta-label">Committed</dt>
                      <dd className="font-mono text-foreground">{p.commitmentAmount ? formatNaira(p.commitmentAmount) : "—"}</dd>
                    </div>
                    <div>
                      <dt className="meta-label">Projects</dt>
                      <dd className="font-mono text-foreground">{p.projects}</dd>
                    </div>
                    <div>
                      <dt className="meta-label">Renewal</dt>
                      <dd className="text-foreground">{monthYear(p.renewalDate)}</dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <PartnershipView id={p.id} name={p.organisationName} {...common} />
                    <RenewAction p={p} isFounder={isFounder} />
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Organisation</TableHead>
                    <TableHead>School</TableHead>
                    <TableHead>Faculty / dept</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead className="text-right">Committed</TableHead>
                    <TableHead className="text-right">Projects</TableHead>
                    <TableHead>Renewal</TableHead>
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="max-w-[16rem]">
                        <span className="block truncate text-sm font-medium text-foreground" title={p.organisationName}>
                          {p.organisationName}
                        </span>
                        {p.pending > 0 ? <span className="text-xs text-gold">{formatNaira(p.pending)} awaiting approval</span> : null}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.school}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.faculty ?? "—"}</TableCell>
                      <TableCell>
                        <StatusPill status={p.displayStatus} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{monthYear(p.startDate)}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">{p.commitmentAmount ? formatNaira(p.commitmentAmount) : "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {p.projects} project{p.projects === 1 ? "" : "s"}
                      </TableCell>
                      <TableCell className={cn("text-sm", p.displayStatus === "RENEWAL_OVERDUE" ? "text-danger" : p.displayStatus === "DUE_RENEWAL" ? "text-gold" : "text-muted-foreground")}>{monthYear(p.renewalDate)}</TableCell>
                      <TableCell>
                        <span className="flex items-center justify-end gap-1.5">
                          <RenewAction p={p} isFounder={isFounder} />
                          <PartnershipView id={p.id} name={p.organisationName} {...common} />
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function RenewAction({ p, isFounder }: { p: PartnershipRow; isFounder: boolean }) {
  if (p.displayStatus !== "DUE_RENEWAL" && p.displayStatus !== "RENEWAL_OVERDUE") return null;
  return <RenewPartnershipButton id={p.id} name={p.organisationName} commitmentAmount={p.commitmentAmount} renewalDate={p.renewalDate} isFounder={isFounder} />;
}

function StatusPill({ status }: { status: PartnershipDisplayStatus }) {
  const s = STATUS[status];
  return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium", s.className)}>{s.label}</span>;
}
