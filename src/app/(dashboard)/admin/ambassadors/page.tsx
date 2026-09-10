import type { Metadata } from "next";
import Link from "next/link";
import { LuMegaphone, LuSearchX, LuPlus, LuBuilding2 } from "react-icons/lu";
import { Button } from "@/components/ui/button";
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

  const [{ rows, total, page, pageCount }, universities] = await Promise.all([
    listAmbassadors({
      university: parsed.university,
      tier: parsed.tier,
      status: parsed.status,
      q: parsed.q,
      page: parsed.page,
    }),
    db.university.findMany({ orderBy: { name: "asc" }, select: { id: true, abbreviation: true } }),
  ]);

  const hasFilters = Boolean(parsed.university || parsed.tier || parsed.status || parsed.q);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Ambassadors
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Campus reps who bring in clients. Referrals, conversions, and commission owed.
          </p>
        </div>
        <div className="flex gap-2">
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
        </div>
      </div>

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
