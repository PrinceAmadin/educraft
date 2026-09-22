import type { Metadata } from "next";
import Link from "next/link";
import { LuCircleCheck } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { PayWithPaystackButton } from "@/components/track/PayWithPaystackButton";
import { IntakeFinalizing } from "@/components/intake/IntakeFinalizing";
import { db } from "@/lib/db";
import { getCompanyBankDetails } from "@/lib/settings";
import { formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "Project submitted" };
export const dynamic = "force-dynamic";

export default async function IntakeSuccessPage({
  searchParams,
}: {
  searchParams: { p?: string; ref?: string };
}) {
  const projectId = searchParams.p?.trim();
  const reference = searchParams.ref?.trim();

  // Pay-first flow: Paystack's redirect can beat the webhook here — poll
  // until the project actually exists instead of assuming ?p= is already set.
  if (!projectId && reference) {
    return <IntakeFinalizing reference={reference} />;
  }

  const [project, bank] = await Promise.all([
    projectId
      ? db.project.findUnique({
          where: { projectId },
          select: {
            projectId: true,
            price: true,
            downpaymentAmount: true,
            downpaymentStatus: true,
            service: { select: { serviceName: true, pricingModel: true } },
            client: { select: { clientId: true } },
          },
        })
      : Promise.resolve(null),
    getCompanyBankDetails(),
  ]);

  const priceKnown = project ? project.price > 0 : false;
  const downpaymentPct =
    project && priceKnown ? Math.round((project.downpaymentAmount / project.price) * 100) : 45;
  // Pay-first intakes arrive here with the downpayment already verified —
  // nothing left to collect, so skip straight to "you're all set".
  const downpaymentAlreadyPaid = project?.downpaymentStatus === "Verified";

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
          {/* Two IDs, each labelled for what it is: the client (one per person) and this order. */}
          <dl className="mt-6 grid w-full grid-cols-2 gap-3 text-left">
            <div className="rounded-2xl bg-zone p-4">
              <dt className="meta-label">Client ID</dt>
              <dd className="mt-1 font-mono text-xl font-bold tracking-tight text-foreground">{project.client.clientId}</dd>
              <dd className="mt-1 text-xs text-muted-foreground">Yours for every order. Sign in with it or your email.</dd>
            </div>
            <div className="rounded-2xl bg-zone p-4">
              <dt className="meta-label">Project ID</dt>
              <dd className="mt-1 font-mono text-xl font-bold tracking-tight text-foreground">{project.projectId}</dd>
              <dd className="mt-1 text-xs text-muted-foreground">This order.</dd>
            </div>
          </dl>
          <p className="mt-4 w-full text-left text-sm text-muted-foreground">
            Track this project, see its progress and pay from your dashboard. The first time, we email a 6-digit code to
            the email you gave us so you can set your password.
          </p>

          <div className="mt-6 w-full surface p-4 text-left text-sm">
            <p className="font-semibold text-foreground">
              {downpaymentAlreadyPaid ? "Downpayment received" : "Payment instructions"}
            </p>
            {downpaymentAlreadyPaid ? (
              <p className="mt-1 text-muted-foreground">
                Your {formatNaira(project.downpaymentAmount)} downpayment is confirmed. Balance of{" "}
                {formatNaira(project.price - project.downpaymentAmount)} is due after approval.
              </p>
            ) : priceKnown ? (
              <p className="mt-1 text-muted-foreground">
                Pay the {downpaymentPct}% downpayment of{" "}
                <span className="font-mono font-semibold text-foreground">
                  {formatNaira(project.downpaymentAmount)}
                </span>{" "}
                to begin. Balance of {formatNaira(project.price - project.downpaymentAmount)} after
                approval. You&apos;ll be redirected to Paystack automatically — stay on this page if you&apos;d
                rather pay by bank transfer instead.
              </p>
            ) : (
              <p className="mt-1 text-muted-foreground">
                This service is priced per document. We&apos;ll confirm the amount and send payment
                details on WhatsApp.
              </p>
            )}

            {priceKnown && !downpaymentAlreadyPaid ? (
              <>
                <div className="mt-3">
                  <PayWithPaystackButton
                    projectId={project.projectId}
                    leg="downpayment"
                    label={`Pay ${formatNaira(project.downpaymentAmount)} with Paystack`}
                    autoStart
                  />
                </div>

                <p className="mt-3 text-center text-xs text-muted-foreground">
                  or pay by bank transfer
                </p>
                <dl className="mt-2 space-y-1.5">
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
              </>
            ) : null}

            <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
              After payment, your project is assigned to a specialist within 24 hours. Message us on
              07063421088 if you have questions.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link href={`/client/login?id=${encodeURIComponent(project.client.clientId)}`}>Go to my dashboard</Link>
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
