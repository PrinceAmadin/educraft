import type { Metadata } from "next";
import { LuExternalLink } from "react-icons/lu";
import { PageHeader } from "@/components/shared/PageHeader";
import { RecruitCardManager } from "@/components/growth/RecruitCardManager";
import { listRecruitCards, qrDataUrl } from "@/lib/services/growth/recruit-cards";
import { getRecruitFunnel, rate, type FunnelStage } from "@/lib/services/growth/recruit-funnel";
import { db } from "@/lib/db";
import { effectiveRole } from "@/lib/rbac";
import { auth } from "@/lib/auth";

export const metadata: Metadata = { title: "Printed cards" };
export const dynamic = "force-dynamic";

/**
 * What the printed cards produced.
 *
 * Every number is derived from rows that already exist, so nothing here can
 * drift from the records it is counted from. Two stages are deliberately
 * missing and the page says so rather than inventing them: there is no
 * separate page view (a scan lands straight on the page), and "started the
 * application" cannot be counted honestly, because the form holds nothing on
 * the server until it is submitted.
 */

const naira = (amount: number) => `\u20a6${amount.toLocaleString("en-NG")}`;
const pct = (part: number, whole: number) => {
  const value = rate(part, whole);
  return value === null ? "—" : `${value}%`;
};

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <p className="meta-label">{label}</p>
      <p className="mt-1 font-mono text-2xl font-medium tabular-nums text-foreground">{value}</p>
      {note ? <p className="mt-0.5 text-[13px] text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function StageRow({ totals }: { totals: FunnelStage }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
      <Stat label="Scans" value={String(totals.scans)} note={`${totals.uniqueScans} different devices`} />
      <Stat
        label="Tapped through"
        value={String(totals.ctaClicks)}
        note={`${pct(totals.ctaClicks, totals.uniqueScans)} of scanners`}
      />
      <Stat
        label="Applications"
        value={String(totals.applications)}
        note={`${pct(totals.applications, totals.uniqueScans)} of scanners`}
      />
      <Stat
        label="Approved"
        value={String(totals.approved)}
        note={`${pct(totals.approved, totals.applications)} of applications`}
      />
      <Stat
        label="Brought a paying student"
        value={String(totals.activated)}
        note={`${pct(totals.activated, totals.approved)} of those approved`}
      />
    </div>
  );
}

export default async function RecruitmentPage() {
  const session = await auth();
  const role = effectiveRole(session?.user?.role ?? "");

  const [cards, funnel, universities] = await Promise.all([
    listRecruitCards(),
    getRecruitFunnel(),
    db.university.findMany({ where: { status: "Active" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  // The QR is regenerated on each load rather than stored: it is a pure
  // function of the code, and a stored image would be one more thing that can
  // disagree with the card it was printed from.
  const qrEntries = await Promise.all(cards.map(async (c) => [c.code, await qrDataUrl(c.code)] as const));
  const qrByCode = Object.fromEntries(qrEntries);

  const [execs, silver] = await Promise.all([
    db.user.findMany({
      where: { isActive: true, role: { in: ["SUPER_ADMIN", "HOG", "COO", "CO_CEO_CFO"] } },
      select: { id: true, displayName: true, role: true, execProfile: { select: { fullName: true } } },
    }),
    db.ambassador.findMany({
      where: { status: "Active", tier: { in: ["SILVER", "GOLD", "PLATINUM"] } },
      select: { id: true, fullName: true, tier: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const holders = [
    ...execs.map((u) => ({
      id: u.id,
      type: "HOG" as const,
      name: `${u.execProfile?.fullName || u.displayName || "Unknown"} (${u.role})`,
    })),
    // Ambassadors only from Silver: a card is a reward for having brought
    // students, and the Core/Sub override they can earn needs Silver anyway.
    ...silver.map((a) => ({ id: a.id, type: "AMBASSADOR" as const, name: `${a.fullName} (${a.tier})` })),
  ];

  const totalCost = funnel.byCard.reduce((sum, c) => sum + (c.costNgn ?? 0), 0);

  return (
    <div className="space-y-10">
      <PageHeader
        title="Printed cards"
        description="A QR design for each person handing cards out, and what each run produced — from the scan to a paying student."
      />

      <section aria-label="Everything so far" className="space-y-5">
        <StageRow totals={funnel.totals} />
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          A scan lands straight on the join page, so a scan is a page view and is not counted twice. There is no
          &ldquo;started the application&rdquo; figure: the form keeps nothing until it is submitted, so
          &ldquo;tapped through&rdquo; is the closest honest measure.
          {totalCost > 0 ? ` Printing so far: ${naira(totalCost)}.` : ""}
        </p>
      </section>

      {funnel.byCard.length > 0 ? (
        <section aria-label="By design" className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">By design</h2>
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="text-left">
                  <th className="meta-label pb-2 font-medium">Design</th>
                  <th className="meta-label pb-2 text-right font-medium">Scans</th>
                  <th className="meta-label pb-2 text-right font-medium">Applied</th>
                  <th className="meta-label pb-2 text-right font-medium">Approved</th>
                  <th className="meta-label pb-2 text-right font-medium">Paying</th>
                  <th className="meta-label pb-2 text-right font-medium">Per application</th>
                </tr>
              </thead>
              <tbody>
                {funnel.byCard.map((c) => (
                  <tr key={c.code} className="border-t border-border">
                    <td className="py-3 pr-4">
                      <span className="font-medium text-foreground">{c.label}</span>
                      <span className="block text-[13px] text-muted-foreground">
                        {c.holderName ?? "Holder missing"}
                        {c.cardSchool ? ` · ${c.cardSchool}` : ""}
                        {c.status !== "ACTIVE" ? " · retired" : ""}
                      </span>
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums">{c.uniqueScans}</td>
                    <td className="py-3 text-right font-mono tabular-nums">{c.applications}</td>
                    <td className="py-3 text-right font-mono tabular-nums">{c.approved}</td>
                    <td className="py-3 text-right font-mono tabular-nums">{c.activated}</td>
                    <td className="py-3 text-right font-mono tabular-nums">
                      {c.costPerApplicationNgn !== null ? naira(c.costPerApplicationNgn) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {funnel.byApplicantSchool.length > 0 ? (
        <section aria-label="By school" className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">Where the applicants came from</h2>
            <ul className="divide-y divide-border text-sm">
              {funnel.byApplicantSchool.map((row) => (
                <li key={row.school} className="flex items-baseline justify-between gap-4 py-2.5">
                  <span className="text-foreground">{row.school}</span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {row.applications} applied · {row.approved} approved
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">Where the cards went</h2>
            <ul className="divide-y divide-border text-sm">
              {funnel.byCardSchool.map((row) => (
                <li key={row.school} className="flex items-baseline justify-between gap-4 py-2.5">
                  <span className="text-foreground">{row.school}</span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {row.uniqueScans} scans · {row.applications} applied
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              The two lists differ when a card handed out at one school brings an applicant from another — that is
              word of mouth, and it is worth knowing.
            </p>
          </div>
        </section>
      ) : null}

      <RecruitCardManager cards={cards} holders={holders} universities={universities} qrByCode={qrByCode} />

      <p className="text-[13px] text-muted-foreground">
        <a href="/join" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline">
          See the page a card opens
          <LuExternalLink className="size-3.5" aria-hidden />
        </a>
        {role === "SUPER_ADMIN" ? " · Upload the clip it plays on Settings > General." : ""}
      </p>
    </div>
  );
}
