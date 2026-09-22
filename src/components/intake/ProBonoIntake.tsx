"use client";

import * as React from "react";
import Link from "next/link";
import { LuCircleCheck } from "react-icons/lu";
import { IntakeForm } from "@/components/intake/IntakeForm";
import type { IntakeTemplate } from "@/lib/intake-templates";

type Props = {
  token: string;
  template: IntakeTemplate;
  service: {
    serviceCode: string;
    serviceName: string;
    basePrice: number;
    estimatedDays: number;
    expressDeliverySurcharge: number | null;
    pricingModel: string;
    downpaymentPercentage: number;
  };
  universities: { id: string; name: string; abbreviation: string }[];
};

/** The intake form for a pro bono link, then its confirmation. */
export function ProBonoIntake({ token, template, service, universities }: Props) {
  const [done, setDone] = React.useState<{ projectId: string; clientId?: string } | null>(null);

  if (done) {
    return (
      <div className="rounded-2xl bg-zone p-6">
        <LuCircleCheck className="size-8 text-success" aria-hidden />
        <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground">Project received</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4">
          {done.clientId ? (
            <div>
              <dt className="meta-label">Client ID</dt>
              <dd className="mt-1 font-mono text-xl font-bold tracking-tight text-foreground">{done.clientId}</dd>
              <dd className="mt-1 text-xs text-muted-foreground">Sign in with it or your email.</dd>
            </div>
          ) : null}
          <div>
            <dt className="meta-label">Project ID</dt>
            <dd className="mt-1 font-mono text-xl font-bold tracking-tight text-foreground">{done.projectId}</dd>
            <dd className="mt-1 text-xs text-muted-foreground">This order.</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-muted-foreground">
          This link has now been used and will not open again.
        </p>
        <Link
          href={done.clientId ? `/client/login?id=${encodeURIComponent(done.clientId)}` : "/client/login"}
          className="mt-5 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
        >
          Sign in to track
        </Link>
      </div>
    );
  }

  return (
    <IntakeForm
      template={template}
      service={service}
      universities={universities}
      proBono={{
        submitUrl: `/api/probono/${encodeURIComponent(token)}/submit`,
        onDone: setDone,
      }}
    />
  );
}
