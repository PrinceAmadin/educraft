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
  const [projectId, setProjectId] = React.useState<string | null>(null);

  if (projectId) {
    return (
      <div className="rounded-2xl bg-zone p-6">
        <LuCircleCheck className="size-8 text-success" aria-hidden />
        <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground">Project received</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Save this ID. You will use it to track your project.
        </p>
        <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-foreground">{projectId}</p>
        <p className="mt-4 text-sm text-muted-foreground">
          This link has now been used and will not open again.
        </p>
        <Link
          href={`/track/${encodeURIComponent(projectId)}`}
          className="mt-5 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
        >
          Track your project
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
        onDone: setProjectId,
      }}
    />
  );
}
