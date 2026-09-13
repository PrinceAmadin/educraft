import type { Metadata } from "next";
import Link from "next/link";
import { LuMegaphone, LuSearchX, LuPlus, LuBuilding2, LuInbox, LuLink } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { Pagination } from "@/components/shared/Pagination";
import { EmptyState } from "@/components/shared/EmptyState";
import { AmbassadorsFilterBar } from "@/components/ambassadors/AmbassadorsFilterBar";
import { AmbassadorsTable } from "@/components/ambassadors/AmbassadorsTable";
import { db } from "@/lib/db";
import { AMBASSADOR_PAGE_SIZE, listAmbassadors } from "@/lib/services/ambassadors";
import { ambassadorListParamsSchema } from "@/lib/validations/ambassadors";

export const metadata: Metadata = { title: "Ambassadors" };
export const dynamic = "force-dynamic";

export default async function AmbassadorsListPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const flat = Object.fromEntries(
    Object.entries(searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );
  const parsed = ambassadorListParamsSchema.parse(flat);

  const [{ rows, total, page, pageCount }, universities, pendingApplications] = await Promise.all([
    listAmbassadors({
      university: parsed.university,
      tier: parsed.tier,
      status: parsed.status,
      q: parsed.q,
      page: parsed.page,
    }),
    db.university.findMany({ orderBy: { name: "asc" }, select: { id: true, abbreviation: true } }),
    db.ambassadorApplication.count({ where: { status: "PENDING" } }),
  ]);

  const hasFilters = Boolean(parsed.university || parsed.tier || parsed.status || parsed.q);

  return (
    <div className="space-y-7">
      <PageHeader
        title="Ambassadors"
        description="Campus reps who bring in clients. Referrals, conversions, and commission owed."
        actions={
          <>
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link href="/admin/ambassadors/panel">
              <LuLink className="size-4" aria-hidden />
              Referral panel
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link href="/admin/ambassadors/applications">
              <LuInbox className="size-4" aria-hidden />
              Applications
              {pendingApplications > 0 ? (
                <span className="ml-1 rounded-full bg-gold/20 px-1.5 text-[11px] font-semibold text-gold">
                  {pendingApplications}
                </span>
              ) : null}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link href="/admin/ambassadors/schools">
              <LuBuilding2 className="size-4" aria-hidden />
              Schools
            </Link>
          </Button>
          <Button asChild size="sm" className="shrink-0">
            <Link href="/admin/ambassadors/new">
              <LuPlus className="size-4" aria-hidden />
              Add ambassador
            </Link>
          </Button>
          </>
        }
      />

      <AmbassadorsFilterBar universities={universities} />

      {rows.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon={LuSearchX}
            title="No ambassadors match these filters"
            description="Try a different tier, status, or clear the filters."
          />
        ) : (
          <EmptyState
            icon={LuMegaphone}
            title="No ambassadors yet"
            description="Add your first ambassador to start tracking referrals and commissions."
            action={{ label: "Add ambassador", href: "/admin/ambassadors/new" }}
          />
        )
      ) : (
        <div className="space-y-4">
          <AmbassadorsTable rows={rows} />
          <Pagination page={page} pageCount={pageCount} total={total} pageSize={AMBASSADOR_PAGE_SIZE} />
        </div>
      )}
    </div>
  );
}
