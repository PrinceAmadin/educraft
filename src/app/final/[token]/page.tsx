import type { Metadata } from "next";
import Image from "next/image";
import { getFinalForCandidate } from "@/lib/services/final-practical";
import { FINAL_TEXT } from "@/lib/screening/final-practical";
import { FinalAssessmentForm } from "@/components/screening/FinalAssessmentForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "EduCraft final assessment",
  robots: { index: false, follow: false },
};

/**
 * The candidate's final assessment. No login — the token is the credential.
 * Outside the (public) route group so there is no marketing chrome around it.
 */
export default async function FinalPage({ params }: { params: { token: string } }) {
  const view = await getFinalForCandidate(params.token);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="flex items-center gap-3 border-b border-border/60 pb-6">
        <Image src="/images/logo/transparent_dark_logo.png" alt="EduCraft" width={128} height={40} className="h-9 w-auto dark:hidden" priority />
        <Image src="/images/logo/transparent_light_logo.png" alt="EduCraft" width={128} height={40} className="hidden h-9 w-auto dark:block" priority />
        <div className="ml-auto text-xs uppercase tracking-wider text-muted-foreground">Final assessment</div>
      </header>

      <div className="mt-8">
        {view ? (
          <FinalAssessmentForm token={params.token} view={view} />
        ) : (
          <div className="rounded-xl bg-zone p-6 text-center">
            <h1 className="text-lg font-semibold text-foreground">{FINAL_TEXT.introTitle}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{FINAL_TEXT.notFound}</p>
          </div>
        )}
      </div>
    </main>
  );
}
