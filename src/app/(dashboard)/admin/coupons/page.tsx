import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccessRoute, effectiveRole, homeForRole } from "@/lib/rbac";
import { listCoupons } from "@/lib/services/finance/coupons";
import { CouponManager } from "@/components/finance/coupons/CouponManager";
import { PageHeader } from "@/components/shared/PageHeader";

export const metadata: Metadata = { title: "Coupons" };
export const dynamic = "force-dynamic";

/**
 * Coupon codes. The CEO creates them and approves the COO's while the approval
 * switch is on; when he switches it off the COO's go live at once.
 *
 * A discount is EduCraft's to carry — everyone on the job is paid their normal
 * share of the list price — so the page leads with how deep a code can go
 * before the money would have to come from somewhere else.
 */
export default async function CouponsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = effectiveRole(session.user.role);
  if (!canAccessRoute(session.user.role, "/admin/coupons")) redirect(homeForRole(role));

  const state = await listCoupons();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Coupons"
        description="Discounts the company carries on its own: workers, ambassadors and executives are still paid in full."
      />
      <CouponManager
        coupons={state.coupons.map((c) => ({
          ...c,
          expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
        }))}
        cooNeedsApproval={state.cooNeedsApproval}
        ceilings={state.ceilings}
        isFounder={role === "SUPER_ADMIN"}
      />
    </div>
  );
}
