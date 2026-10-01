import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { LuFileText } from "react-icons/lu";
import { StatementView } from "@/components/finance/statements/StatementView";
import { GenerateStatement } from "@/components/finance/statements/GenerateStatement";
import { getStatement, listStatements } from "@/lib/services/finance/weekly-statement";
import { cn, formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "Financial statements" };
export const dynamic = "force-dynamic";

/**
 * Weekly financial statements (Phase 7, founder + CFO). Generate a week, read it
 * on screen, download the PDF or Excel, and the Sunday auto-email sends the
 * completed week's digest. The money view: revenue, commissions accrued, payouts
 * out, pot movements, refunds, bucket health, outstanding and the cash position.
 */
export default async function StatementsPage({ searchParams }: { searchParams: { id?: string } }) {
  const history = await listStatements();
  const selectedId = searchParams.id ?? history[0]?.id ?? null;
  const selected = selectedId ? await getStatement(selectedId) : null;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Financial statements"
        description="A week of EduCraft's money: revenue, commissions accrued, payouts, pot movements, refunds, bucket health and the cash position. Monday to Sunday."
        back={{ href: "/admin/finance", label: "Finance" }}
        actions={<GenerateStatement hasForWeek={history.length > 0} />}
      />

      {selected ? (
        <StatementView id={selected.id} data={selected.data} />
      ) : (
        <EmptyState icon={LuFileText} title="No statements yet" description="Generate the last completed week to begin. Each one is a Monday-to-Sunday view of the money." />
      )}

      {history.length > 0 ? (
        <section>
          <h2 className="text-[15px] font-semibold text-foreground">Past weeks</h2>
          <ul className="mt-2 divide-y divide-border/70">
            {history.map((s) => (
              <li key={s.id} className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5", s.id === selectedId && "opacity-100")}>
                <Link href={`/admin/finance/statements?id=${s.id}`} className={cn("text-sm hover:underline", s.id === selectedId ? "font-semibold text-foreground" : "text-primary")}>
                  {s.label}
                  <span className="ml-2 text-xs text-muted-foreground">{s.isoWeek}</span>
                </Link>
                <span className="flex items-center gap-3 text-[13px] text-muted-foreground">
                  <span className="font-mono tabular-nums text-foreground">{formatNaira(s.net)} net</span>
                  <span className={cn("font-mono tabular-nums", s.position < 0 ? "text-danger" : "text-foreground")}>{formatNaira(s.position)} position</span>
                  {s.autoEmailed ? <span className="text-xs">emailed</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
