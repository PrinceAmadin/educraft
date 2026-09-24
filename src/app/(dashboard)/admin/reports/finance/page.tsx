import { redirect } from "next/navigation";

/** The finance report lives on the Finance Platform now (Phase 2). Old links land there, month kept. */
export default function FinanceReportsRedirect({ searchParams }: { searchParams: { month?: string } }) {
  const period = searchParams.month ? `&period=${encodeURIComponent(searchParams.month)}` : "";
  redirect(`/admin/finance/reports?type=monthly${period}`);
}
