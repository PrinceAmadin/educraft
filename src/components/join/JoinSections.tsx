import Image from "next/image";
import { DisplayHeading, Eyebrow, Section } from "@/components/primitives/Section";
import { Reveal } from "@/components/primitives/Reveal";
import { JOIN_TEXT } from "@/lib/ambassadors/ambassador-copy";
import type { PublicCommissionLadder } from "@/lib/services/cashflow";

/**
 * The body of the join page.
 *
 * Grounds alternate A / B exactly as the home page does, so the two read as
 * one site. Every figure arrives as a prop from a live read — the published
 * cashflow structure, the service catalogue, the roster — and none is written
 * into the copy.
 */

const naira = (amount: number) => `\u20a6${amount.toLocaleString("en-NG")}`;

/* ── 03 · What the role actually is ─────────────────────────── */

export function WhatYouDo() {
  const t = JOIN_TEXT.whatYouDo;
  return (
    <Section ground="b" rhythm="normal" id="the-role">
      <div className="shell">
        <div className="grid-12">
          <div className="col-span-4 md:col-span-5">
            <Reveal>
              <Eyebrow index="01">{t.eyebrow}</Eyebrow>
            </Reveal>
            <Reveal delay={60}>
              <DisplayHeading lines={[...t.heading]} className="mt-5" />
            </Reveal>
          </div>
          <ol className="col-span-4 mt-10 space-y-9 md:col-span-6 md:col-start-7 md:mt-0">
            {t.steps.map((step, i) => (
              <Reveal as="li" key={step.title} delay={60 * i}>
                <p className="index-mark text-primary">{String(i + 1).padStart(2, "0")}</p>
                <h3 className="mt-2 text-[1.0625rem] font-semibold text-foreground">{step.title}</h3>
                <p className="mt-2 max-w-[52ch] leading-relaxed text-muted-foreground">{step.body}</p>
              </Reveal>
            ))}
            <Reveal as="li" delay={240}>
              <p className="max-w-[52ch] border-l-2 border-primary/30 pl-4 leading-relaxed text-muted-foreground">
                {t.reassurance}
              </p>
            </Reveal>
          </ol>
        </div>
      </div>
    </Section>
  );
}

/* ── 04 · The money ─────────────────────────────────────────── */

export function TheMoney({ ladder }: { ladder: PublicCommissionLadder | null }) {
  const t = JOIN_TEXT.money;
  return (
    <Section ground="a" rhythm="open" id="money">
      <div className="shell">
        <Reveal>
          <Eyebrow index="02">{t.eyebrow}</Eyebrow>
        </Reveal>
        <div className="grid-12 mt-5">
          <div className="col-span-4 md:col-span-5">
            <Reveal delay={60}>
              <DisplayHeading lines={[...t.heading]} />
            </Reveal>
          </div>
          <div className="col-span-4 md:col-span-6 md:col-start-7">
            {!ladder ? (
              <Reveal delay={100}>
                <p className="leading-relaxed text-muted-foreground">{t.unavailable}</p>
              </Reveal>
            ) : (
              <>
                <Reveal delay={100}>
                  <p className="max-w-[50ch] leading-relaxed text-muted-foreground">{t.intro}</p>
                </Reveal>

                {/* Rows with faint dividers, never a bordered table. */}
                <Reveal delay={160}>
                  <dl className="mt-8">
                    <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 pb-2.5 md:grid-cols-[1fr_auto_auto_auto] md:gap-x-7">
                      <span className="meta-label">{t.tableHeads.tier}</span>
                      <span className="meta-label hidden md:block">{t.tableHeads.clients}</span>
                      <span className="meta-label text-right">{t.tableHeads.rate}</span>
                      <span className="meta-label text-right">{t.tableHeads.earns}</span>
                    </div>
                    {ladder.tiers.map((tier) => (
                      <div
                        key={tier.tier}
                        className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 border-t border-hairline/15 py-3.5 md:grid-cols-[1fr_auto_auto_auto] md:gap-x-7"
                      >
                        <dt className="font-medium text-foreground">{tier.label}</dt>
                        <dd className="hidden text-sm text-muted-foreground md:block">
                          {t.tierClients(tier.minPayingClients)}
                        </dd>
                        <dd className="tabular text-right text-muted-foreground">{tier.rate}%</dd>
                        <dd className="tabular text-right font-medium text-foreground">{naira(tier.earnsNgn)}</dd>
                      </div>
                    ))}
                  </dl>
                </Reveal>

                <Reveal delay={220}>
                  <div className="mt-7 space-y-3 text-sm leading-relaxed text-muted-foreground">
                    <p>{t.basis(ladder.referencePriceNgn)}</p>
                    {ladder.paidAtDownpayment ? (
                      <p className="text-foreground">{t.trigger(ladder.downpaymentPercent)}</p>
                    ) : null}
                    <p className="text-foreground">{t.cadence}</p>
                  </div>
                </Reveal>
              </>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ── 05 · A company, not a side hustle ──────────────────────── */

export function WhyUs() {
  const t = JOIN_TEXT.whyUs;
  return (
    <Section ground="b" rhythm="normal">
      <div className="shell">
        <div className="grid-12">
          <div className="col-span-4 md:col-span-5">
            <Reveal>
              <Eyebrow index="03">{t.eyebrow}</Eyebrow>
            </Reveal>
            <Reveal delay={60}>
              <DisplayHeading lines={[...t.heading]} className="mt-5" />
            </Reveal>
          </div>
          <div className="col-span-4 mt-10 md:col-span-6 md:col-start-7 md:mt-0">
            <div className="index-list space-y-8">
              {t.points.map((point, i) => (
                <Reveal key={point.title} delay={60 * i}>
                  <h3 className="text-[1.0625rem] font-semibold text-foreground">{point.title}</h3>
                  <p className="mt-2 max-w-[52ch] leading-relaxed text-muted-foreground">{point.body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ── 06 · What is already running ───────────────────────────── */

export function Receipts({
  ambassadors,
  campuses,
  dashboard,
}: {
  ambassadors: number | null;
  campuses: number | null;
  dashboard: { light: string; dark: string } | null;
}) {
  const t = JOIN_TEXT.receipts;
  return (
    <Section ground="a" rhythm="normal">
      <div className="shell">
        <div className="grid-12">
          <div className="col-span-4 md:col-span-5">
            <Reveal>
              <Eyebrow index="04">{t.eyebrow}</Eyebrow>
            </Reveal>
            <Reveal delay={60}>
              <DisplayHeading lines={[...t.heading]} className="mt-5" />
            </Reveal>
            <Reveal delay={120}>
              <ul className="mt-7 space-y-2.5 text-muted-foreground">
                {ambassadors !== null ? <li>{t.ambassadors(ambassadors)}</li> : null}
                {campuses !== null ? <li>{t.campuses(campuses)}</li> : null}
                <li>{t.agreement}</li>
              </ul>
            </Reveal>
          </div>
          <div className="col-span-4 mt-10 md:col-span-6 md:col-start-7 md:mt-0">
            <Reveal delay={100}>
              <p className="max-w-[48ch] leading-relaxed text-muted-foreground">{t.dashboardBody}</p>
            </Reveal>
            {dashboard ? (
              <Reveal delay={160}>
                <figure className="mt-6">
                  <Image
                    src={dashboard.light}
                    alt="The ambassador dashboard, showing referral link, students referred and earnings"
                    width={1200}
                    height={760}
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="w-full rounded-xl shadow-soft dark:hidden"
                  />
                  <Image
                    src={dashboard.dark}
                    alt="The ambassador dashboard, showing referral link, students referred and earnings"
                    width={1200}
                    height={760}
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="hidden w-full rounded-xl shadow-soft dark:block"
                  />
                  {/* Required: the figures in it are seeded sample data, and an
                      uncaptioned screenshot would read as a real result. */}
                  <figcaption className="meta-label mt-2.5">{t.dashboardCaption}</figcaption>
                </figure>
              </Reveal>
            ) : null}
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ── 07 · The three questions ───────────────────────────────── */

export function Questions() {
  const t = JOIN_TEXT.questions;
  return (
    <Section ground="b" rhythm="normal">
      <div className="shell">
        <div className="grid-12">
          <div className="col-span-4 md:col-span-4">
            <Reveal>
              <Eyebrow index="05">{t.eyebrow}</Eyebrow>
            </Reveal>
            <Reveal delay={60}>
              <DisplayHeading lines={[...t.heading]} className="mt-5" />
            </Reveal>
          </div>
          {/* Plain headings with the answers visible — never folded away. On a
              page meant to win an application, a hidden answer is a lost one. */}
          <div className="col-span-4 mt-10 space-y-9 md:col-span-7 md:col-start-6 md:mt-0">
            {t.items.map((item, i) => (
              <Reveal key={item.q} delay={60 * i}>
                <h3 className="text-[1.0625rem] font-semibold text-foreground">{item.q}</h3>
                <p className="mt-2.5 max-w-[58ch] leading-relaxed text-muted-foreground">{item.a}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
