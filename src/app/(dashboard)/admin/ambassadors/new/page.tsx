import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { NewAmbassadorForm } from "@/components/ambassadors/NewAmbassadorForm";

export const metadata: Metadata = { title: "Add ambassador" };
export const dynamic = "force-dynamic";

export default async function NewAmbassadorPage() {
  const universities = await db.university.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, abbreviation: true },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href="/admin/ambassadors/list"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All ambassadors
      </Link>
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Add ambassador
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create an ambassador profile with an auto-generated referral code.
        </p>
      </div>
      <NewAmbassadorForm universities={universities} />
    </div>
  );
}
