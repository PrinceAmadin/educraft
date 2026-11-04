import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LuArrowLeft, LuInbox } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { canAccessRoute, effectiveRole, homeForRole } from "@/lib/rbac";
import { getScreeningReviewDetail, listScreeningReview } from "@/lib/services/screening";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { ScreeningReviewList, ScreeningReviewDetailView } from "@/components/screening/ScreeningReview";

export const metadata: Metadata = { title: "Screening results" };
export const dynamic = "force-dynamic";

/**
 * The COO's (and founder's) view of submitted screening sittings: a list, and
 * a per-sitting detail with the "name the tell" answers to weigh and the
 * pass/fail decision. Covered by the /admin/workers permission (SA + COO).
 */
export default async function ScreeningReviewPage({ searchParams }: { searchParams: { a?: string } }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canAccessRoute(session.user.role, "/admin/workers")) redirect(homeForRole(effectiveRole(session.user.role)));

  const isFounder = effectiveRole(session.user.role) === "SUPER_ADMIN";
  const detail = searchParams.a ? await getScreeningReviewDetail(searchParams.a) : null;
  const list = detail ? [] : await listScreeningReview();

  return (
    <div className="space-y-7">
      <Link
        href="/admin/workers/applications"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
      >
        <LuArrowLeft className="size-4" aria-hidden />
        Worker applications
      </Link>

      <PageHeader
        title="Screening results"
        description="Submitted screening tests. A borderline score and the written tells are yours to judge; your decision moves the application forward."
        actions={
          isFounder ? (
            <Link
              href="/admin/settings/screening"
              className="inline-flex items-center gap-1.5 rounded-lg bg-zone px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-zone/70"
            >
              Manage question bank
            </Link>
          ) : undefined
        }
      />

      {detail ? (
        <ScreeningReviewDetailView detail={detail} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={LuInbox}
          title="No screening results yet"
          description="When a candidate submits their screening test, it appears here for review."
        />
      ) : (
        <ScreeningReviewList rows={list} />
      )}
    </div>
  );
}
