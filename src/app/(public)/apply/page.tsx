import type { Metadata } from "next";
import { db } from "@/lib/db";
import { ApplyForm } from "@/components/apply/ApplyForm";
import { nextGeneralCode } from "@/lib/services/ambassador-roster";

export const metadata: Metadata = {
  title: "Become an ambassador",
  description: "Earn commission representing EduCraft on your campus.",
};
export const dynamic = "force-dynamic";

export default async function ApplyPage() {
  const [universities, { code: slotCode }] = await Promise.all([
    db.university.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, abbreviation: true },
    }),
    nextGeneralCode(),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Become an EduCraft ambassador
        </h1>
        <p className="mt-2 max-w-prose text-muted-foreground">
          Represent EduCraft on your campus, refer students who need academic help, and earn
          commission on every project they place — 10% to start, rising to 15% as you grow.
        </p>
      </div>
      <ApplyForm universities={universities} slotCode={slotCode} />
    </div>
  );
}
