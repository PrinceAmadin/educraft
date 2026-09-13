import type { Metadata } from "next";
import Link from "next/link";
import { LuCircleCheck } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { getCompanyBankDetails } from "@/lib/settings";
import { formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "Project submitted" };
export const dynamic = "force-dynamic";

export default async function IntakeSuccessPage({
  searchParams,
}: {
  searchParams: { p?: string };
}) {
  const projectId = searchParams.p?.trim();

  const [project, bank] = await Promise.all([
    projectId
      ? db.project.findUnique({
          where: { projectId },
          select: {
            projectId: true,
            price: true,
            downpaymentAmount: true,
            service: { select: { serviceName: true, pricingModel: true } },
          },
        })
      : Promise.resolve(null),
    getCompanyBankDetails(),
  ]);

  const priceKnown = project ? project.price > 0 : false;
  const downpaymentPct =
    project && priceKnown ? Math.round((project.downpaymentAmount / project.price) * 100) : 45;

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-16 text-center sm:py-20">
      <span className="rounded-full bg-success/12 p-3 text-success">
        <LuCircleCheck className="size-8" aria-hidden />
      </span>
      <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        Your project has been submitted
      </h1>

      {project ? (
        <>
          <p className="mt-3 text-muted-foreground">Save this ID — you&apos;ll use it to track your project.</p>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {project.projectId}
          </p>

          <div className="mt-6 w-full surface p-4 text-left text-sm">
            <p className="font-semibold text-foreground">Payment instructions</p>
            {priceKnown ? (
              <p className="mt-1 text-muted-foreground">
                Pay the {downpaymentPct}% downpayment of{" "}
                <span className="font-mono font-semibold text-foreground">
                  {formatNaira(project.downpaymentAmount)}
                </span>{" "}
                to begin. Balance of {formatNaira(project.price - project.downpaymentAmount)} after
                approval.
              </p>
            ) : (
              <p className="mt-1 text-muted-foreground">
                This service is priced per document. We&apos;ll confirm the amount and send payment
                details on WhatsApp.
              </p>
            )}

            {priceKnown ? (
              <dl className="mt-3 space-y-1.5">
                {bank.complete ? (
                  <>
                    <PayRow label="Bank" value={bank.bankName!} />
                    <PayRow label="Account number" value={bank.accountNumber!} mono />
                    <PayRow label="Account name" value={bank.accountName!} />
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    We&apos;ll send bank details on WhatsApp shortly.
                  </p>
                )}
                <PayRow label="Reference" value={project.projectId} mono />
              </dl>
            ) : null}

            <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
              After payment, your project is assigned to a specialist within 24 hours. Message us on
              07063421088 if you have questions.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link href={`/track/${encodeURIComponent(project.projectId)}`}>Track your project</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/intake">Start another project</Link>
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 text-muted-foreground">
            We&apos;ve received your request and will be in touch on WhatsApp shortly.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link href="/intake">Start another project</Link>
          </Button>
        </>
      )}
    </div>
  );
}

function PayRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono font-medium text-foreground" : "font-medium text-foreground"}>
        {value}
      </dd>
    </div>
  );
}
