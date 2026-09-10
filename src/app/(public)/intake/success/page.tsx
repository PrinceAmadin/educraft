import type { Metadata } from "next";
import Link from "next/link";
import { LuCircleCheck } from "react-icons/lu";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Project submitted" };

export default function IntakeSuccessPage({
  searchParams,
}: {
  searchParams: { p?: string };
}) {
  const projectId = searchParams.p;

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-16 text-center sm:py-24">
      <span className="rounded-full bg-success/12 p-3 text-success">
        <LuCircleCheck className="size-8" aria-hidden />
      </span>
      <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        Project submitted
      </h1>
      {projectId ? (
        <p className="mt-2 text-muted-foreground">
          Your project ID is{" "}
          <span className="font-mono font-semibold text-foreground">{projectId}</span>. Save it —
          you&apos;ll use it to track progress.
        </p>
      ) : (
        <p className="mt-2 text-muted-foreground">We&apos;ve received your request.</p>
      )}

      <div className="mt-6 w-full rounded-xl border border-border bg-card p-4 text-left text-sm">
        <p className="font-medium text-foreground">What happens next</p>
        <ol className="mt-2 space-y-1.5 text-muted-foreground">
          <li>1. We message you on WhatsApp to confirm details and send payment instructions.</li>
          <li>2. You pay the 45% downpayment. Work begins once it&apos;s verified.</li>
          <li>3. We deliver a draft, you review, and pay the balance on approval.</li>
        </ol>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {projectId ? (
          <Button asChild>
            <Link href={`/track?id=${encodeURIComponent(projectId)}`}>Track this project</Link>
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <Link href="/intake">Start another project</Link>
        </Button>
      </div>
    </div>
  );
}
