import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { LuLock } from "react-icons/lu";
import { db } from "@/lib/db";
import { getServiceByCode } from "@/lib/services/intake";
import { getLinkState, inviteIdForToken } from "@/lib/services/probono";
import { deviceCookieName } from "@/lib/pro-bono";
import { resolveTemplate } from "@/lib/intake-templates";
import { ProBonoClaim } from "@/components/intake/ProBonoClaim";
import { ProBonoIntake } from "@/components/intake/ProBonoIntake";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "EduCraft project form",
  robots: { index: false, follow: false },
};

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-zone p-6">
      <LuLock className="size-6 text-muted-foreground" aria-hidden />
      <h1 className="mt-3 text-xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

export default async function ProBonoPage({ params }: { params: { token: string } }) {
  const inviteId = await inviteIdForToken(params.token);
  const secret = inviteId ? (cookies().get(deviceCookieName(inviteId))?.value ?? null) : null;
  const link = await getLinkState(params.token, secret);

  let body: React.ReactNode;

  switch (link.state) {
    case "invalid":
      body = (
        <Notice title="This link is not valid">
          Check that you copied the whole link, or ask EduCraft to send it again.
        </Notice>
      );
      break;
    case "revoked":
      body = (
        <Notice title="This link is no longer active">Contact EduCraft if you think this is a mistake.</Notice>
      );
      break;
    case "used":
      body = (
        <Notice title="This link has already been used">
          A project was submitted through it, so it cannot be opened again. Contact EduCraft if you need
          anything changed.
        </Notice>
      );
      break;
    case "locked":
      body = (
        <Notice title="This link is tied to another device">
          It was first opened on a different phone or browser, and it only works there. Open it on that
          device, or ask EduCraft to reset it for you.
        </Notice>
      );
      break;
    case "unclaimed":
      body = <ProBonoClaim token={params.token} />;
      break;
    case "ready": {
      const service = await getServiceByCode(link.serviceCode);
      const template = service ? resolveTemplate(service.intakeFormTemplate) : null;
      if (!service || !template) {
        body = <Notice title="This form is not available">Contact EduCraft and we will sort it out.</Notice>;
        break;
      }
      const universities = await db.university.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, abbreviation: true },
      });
      body = (
        <>
          <div className="mb-9">
            <p className="eyebrow">EduCraft</p>
            <h1 className="mt-1 font-display text-[1.75rem] font-bold leading-tight tracking-tight text-foreground sm:text-[2rem]">
              {service.serviceName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Prepared for {link.recipient}. There is nothing to pay.
            </p>
          </div>
          <ProBonoIntake
            token={params.token}
            template={template}
            universities={universities}
            service={{
              serviceCode: service.serviceCode,
              serviceName: service.serviceName,
              basePrice: service.basePrice,
              estimatedDays: service.estimatedDays,
              expressDeliverySurcharge: service.expressDeliverySurcharge,
              pricingModel: service.pricingModel,
              downpaymentPercentage: service.downpaymentPercentage,
            }}
          />
        </>
      );
      break;
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      {body}
      <p className="mt-10 text-xs text-subtle">
        Questions? <Link href="/" className="underline">EduCraft</Link> · 07063421088
      </p>
    </div>
  );
}
