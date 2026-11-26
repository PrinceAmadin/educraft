import type { Metadata } from "next";
import { db } from "@/lib/db";
import { ApplyForm } from "@/components/apply/ApplyForm";
import { nextGeneralCode } from "@/lib/services/ambassador-roster";
import { publicCommissionLadder } from "@/lib/services/cashflow";

export const metadata: Metadata = {
  title: "Become an ambassador",
  description: "Earn commission representing EduCraft on your campus.",
};
export const dynamic = "force-dynamic";

export default async function ApplyPage() {
  const [universities, { code: slotCode }, ladder] = await Promise.all([
    db.university.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, abbreviation: true },
    }),
    nextGeneralCode(),
    // Rates come from the published structure, never this file: republish the
    // cashflow and this sentence moves with it. Null (no structure, or the
    // database unreachable) drops the clause rather than quoting a stale rate.
    publicCommissionLadder(),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Become an EduCraft ambassador
        </h1>
        <p className="mt-2 max-w-prose text-muted-foreground">
          Represent EduCraft on your campus, refer students who need academic help, and earn
          commission on every project they place
          {ladder ? ` — ${ladder.startRate}% to start, rising to ${ladder.topRate}% as you grow` : ""}.
        </p>
      </div>
      <ApplyForm universities={universities} slotCode={slotCode} />
    </div>
  );
}
