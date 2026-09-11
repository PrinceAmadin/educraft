import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LuInbox } from "react-icons/lu";
import { db } from "@/lib/db";
import { listApplications } from "@/lib/services/applications";
import { ApplicationReview } from "@/components/ambassadors/ApplicationReview";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Ambassador applications" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
] as const;

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const status =
    searchParams.status === "APPROVED" || searchParams.status === "REJECTED"
      ? searchParams.status
      : "PENDING";

  const [rows, universities] = await Promise.all([
    listApplications(status),
    db.university.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, abbreviation: true } }),
  ]);

  return (
    <div className="space-y-5">
      <Link
        href="/admin/ambassadors"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All ambassadors
      </Link>
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Ambassador applications
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review campus applications. Approving creates an ambassador with a referral code.
        </p>
      </div>

      <div className="flex gap-1.5">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/ambassadors/applications?status=${t.key}`}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              status === t.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={LuInbox}
          title={`No ${status.toLowerCase()} applications`}
          description={
            status === "PENDING"
              ? "New applications from /apply show up here."
              : "Nothing here yet."
          }
        />
      ) : status === "PENDING" ? (
        <ApplicationReview rows={rows} universities={universities} />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">{row.fullName}</span>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs font-medium",
                    row.status === "APPROVED"
                      ? "border-transparent bg-success/15 text-success"
                      : "border-transparent bg-danger/15 text-danger"
                  )}
                >
                  {row.status}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {row.university ?? "—"} · applied {formatDate(row.createdAt)}
              </p>
              {row.reviewNote ? (
                <p className="mt-2 text-sm text-muted-foreground">Note: {row.reviewNote}</p>
              ) : null}
              {row.ambassadorId ? (
                <Link
                  href={`/admin/ambassadors/${row.ambassadorId}`}
                  className="mt-2 inline-flex text-xs font-medium text-primary hover:underline"
                >
                  View ambassador →
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
