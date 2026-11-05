import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LuArrowLeft, LuInbox } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { canAccessRoute, effectiveRole, homeForRole } from "@/lib/rbac";
import { getFinalReviewDetail, listFinalReview } from "@/lib/services/final-practical";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { FinalReviewList, FinalReviewDetailView } from "@/components/screening/FinalReview";

export const metadata: Metadata = { title: "Final assessments" };
export const dynamic = "force-dynamic";

/**
 * The COO's (and founder's) view of submitted final assessments: the two
 * writing samples with the voice scan, the two written answers, and the
 * approve/decline decision. Covered by the /admin/workers permission (SA + COO).
 */
export default async function FinalReviewPage({ searchParams }: { searchParams: { a?: string } }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canAccessRoute(session.user.role, "/admin/workers")) redirect(homeForRole(effectiveRole(session.user.role)));

  const detail = searchParams.a ? await getFinalReviewDetail(searchParams.a) : null;
  const list = detail ? [] : await listFinalReview();

  return (
    <div className="space-y-7">
      <Link href="/admin/workers/applications" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline">
        <LuArrowLeft className="size-4" aria-hidden />
        Worker applications
      </Link>

      <PageHeader title="Final assessments" description="Submitted final practicals. Read the writing and the answers, and your decision approves or declines the application." />

      {detail ? (
        <FinalReviewDetailView detail={detail} />
      ) : list.length === 0 ? (
        <EmptyState icon={LuInbox} title="No final assessments yet" description="When a candidate submits their final practical, it appears here for review." />
      ) : (
        <FinalReviewList rows={list} />
      )}
    </div>
  );
}
