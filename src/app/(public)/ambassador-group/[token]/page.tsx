import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { LuLock, LuUsers } from "react-icons/lu";
import { getHqContact } from "@/lib/services/hq-contact";
import { getAmbassadorGroupUrl } from "@/lib/services/settings";
import { groupDeviceCookieName, groupLinkState, inviteIdForGroupToken } from "@/lib/services/ambassador-group";
import { AmbassadorGroupClaim } from "@/components/ambassadors/AmbassadorGroupClaim";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "EduCraft ambassador group",
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

export default async function AmbassadorGroupPage({ params }: { params: { token: string } }) {
  const inviteId = await inviteIdForGroupToken(params.token);
  const secret = inviteId ? (cookies().get(groupDeviceCookieName(inviteId))?.value ?? null) : null;
  const link = await groupLinkState(params.token, secret);

  let body: React.ReactNode;

  switch (link.state) {
    case "invalid":
      body = (
        <Notice title="This link is not valid">
          Check that you copied the whole link, or ask the Head of Growth to send it again.
        </Notice>
      );
      break;
    case "revoked":
      body = (
        <Notice title="This link is no longer active">
          Ask the Head of Growth for a new one.
        </Notice>
      );
      break;
    case "locked":
      body = (
        <Notice title="This link is tied to another device">
          It was first opened on a different phone or browser, and it only works there. Open it on that
          device, or ask the Head of Growth to send you a new link.
        </Notice>
      );
      break;
    case "unclaimed":
      body = <AmbassadorGroupClaim token={params.token} />;
      break;
    case "ready": {
      // Read at request time, so the CEO changing the group URL in Settings
      // moves every ambassador's link to the new group at once.
      const groupUrl = await getAmbassadorGroupUrl();
      body = (
        <div className="rounded-2xl bg-zone p-6 text-center">
          <LuUsers className="mx-auto size-7 text-primary" aria-hidden />
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-foreground">
            Join the EduCraft ambassador group
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This link is now tied to this device. Tap below to open the group in WhatsApp.
          </p>
          <a
            href={groupUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LuUsers className="size-4" aria-hidden />
            Open the WhatsApp group
          </a>
        </div>
      );
      break;
    }
  }

  const hq = await getHqContact();
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      {body}
      <p className="mt-10 text-xs text-subtle">
        Questions? <Link href="/" className="underline">EduCraft</Link> · {hq.phone}
      </p>
    </div>
  );
}
