import type { Metadata } from "next";
import Image from "next/image";
import { getScreeningForCandidate } from "@/lib/services/screening";
import { SCREENING_TEXT } from "@/lib/screening/rules";
import { ScreeningTest } from "@/components/screening/ScreeningTest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "EduCraft worker screening",
  robots: { index: false, follow: false },
};

/**
 * The candidate's screening test. No login — the token in the URL is the
 * credential (the supervisor-package pattern). It lives outside the (public)
 * route group on purpose, so there is no marketing header or footer around a
 * timed test.
 */
export default async function ScreenPage({ params }: { params: { token: string } }) {
  const view = await getScreeningForCandidate(params.token);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="flex items-center gap-3 border-b border-border/60 pb-6">
        <Image
          src="/images/logo/transparent_dark_logo.png"
          alt="EduCraft"
          width={128}
          height={40}
          className="h-9 w-auto dark:hidden"
          priority
        />
        <Image
          src="/images/logo/transparent_light_logo.png"
          alt="EduCraft"
          width={128}
          height={40}
          className="hidden h-9 w-auto dark:block"
          priority
        />
        <div className="ml-auto text-xs uppercase tracking-wider text-muted-foreground">Worker screening</div>
      </header>

      <div className="mt-8">
        {view ? (
          <ScreeningTest token={params.token} view={view} />
        ) : (
          <div className="rounded-xl bg-zone p-6 text-center">
            <h1 className="text-lg font-semibold text-foreground">{SCREENING_TEXT.introTitle}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{SCREENING_TEXT.notFound}</p>
          </div>
        )}
      </div>
    </main>
  );
}
