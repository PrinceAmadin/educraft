import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { waitUntil } from "@vercel/functions";
import Image from "next/image";
import { LuDownload, LuExternalLink, LuFileText } from "react-icons/lu";
import { CopyCitationButton } from "@/components/research/CopyCitationButton";
import { cn } from "@/lib/utils";
import { loadSupervisorPackage, recordSupervisorView, type SupervisorReference } from "@/lib/services/supervisor-package";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const pkg = await loadSupervisorPackage(params.token);
  if (!pkg) return { title: "Reference bibliography · EduCraft" };
  return {
    title: `${pkg.projectTitle ?? pkg.projectCode} · Reference bibliography · EduCraft`,
    description: `${pkg.totals.total} verified academic references — ${pkg.totals.withPdf} with downloadable PDFs, ${pkg.totals.paywalled} available through your university library.`,
    robots: { index: false, follow: false },
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function TierChip({ tier }: { tier: SupervisorReference["tier"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
        tier === "key" ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-zone text-foreground",
      )}
    >
      {tier === "key" ? "Core" : "Closely related"}
    </span>
  );
}

function ReferenceCard({ token, r }: { token: string; r: SupervisorReference }) {
  const meta = [r.authors, r.year, r.journal, r.citations != null ? `${r.citations.toLocaleString()} citations` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="rounded-xl border border-border/60 bg-card px-4 py-3 print:break-inside-avoid print:border-black/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-foreground">{r.title}</p>
          {meta ? <p className="mt-1 text-sm text-muted-foreground">{meta}</p> : null}
          {r.doi ? (
            <a
              href={`https://doi.org/${r.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 break-all font-mono text-xs text-primary hover:underline"
            >
              doi.org/{r.doi}
            </a>
          ) : null}
          {r.abstract ? (
            <details className="group mt-2 text-sm">
              <summary className="cursor-pointer list-none text-xs font-medium text-primary hover:underline print:hidden">
                <span className="group-open:hidden">Show abstract</span>
                <span className="hidden group-open:inline">Hide abstract</span>
              </summary>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/90">{r.abstract}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Abstract via OpenAlex.</p>
            </details>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <TierChip tier={r.tier} />
          {r.formattedCitation ? <CopyCitationButton citation={r.formattedCitation} /> : null}
          {r.hasPdf ? (
            <a
              href={`/api/research/${token}/pdf/${r.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-soft hover:bg-primary/90 print:hidden"
            >
              <LuDownload className="size-4" aria-hidden /> PDF
            </a>
          ) : r.doi ? (
            <a
              href={`https://doi.org/${r.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground print:hidden"
            >
              <LuExternalLink className="size-4" aria-hidden /> Get from library
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/**
 * A tier section — Core references OR Closely related. Papers with a
 * downloadable PDF come first (the supervisor can click and read immediately),
 * then the paywalled ones with DOI links to the publisher. Order within each
 * sub-group preserves the loader's citation-count desc sort.
 */
function TierSection({
  title,
  intro,
  withPdf,
  paywalled,
  token,
}: {
  title: string;
  intro: string;
  withPdf: SupervisorReference[];
  paywalled: SupervisorReference[];
  token: string;
}) {
  const total = withPdf.length + paywalled.length;
  if (total === 0) return null;
  return (
    <section className="mt-10">
      <div className="border-b border-border/60 pb-2">
        <h2 className="text-xl font-semibold text-foreground">
          {title} <span className="text-muted-foreground">({total})</span>
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{intro}</p>
      </div>
      {withPdf.length > 0 ? (
        <>
          <p className="mt-6 text-sm font-medium text-foreground">With PDF ({withPdf.length})</p>
          <ul className="mt-2 space-y-2">
            {withPdf.map((r) => (
              <ReferenceCard key={r.id} token={token} r={r} />
            ))}
          </ul>
        </>
      ) : null}
      {paywalled.length > 0 ? (
        <>
          <p className="mt-6 text-sm font-medium text-foreground">Available through your library ({paywalled.length})</p>
          <ul className="mt-2 space-y-2">
            {paywalled.map((r) => (
              <ReferenceCard key={r.id} token={token} r={r} />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

export default async function SupervisorPage({ params }: { params: { token: string } }) {
  const pkg = await loadSupervisorPackage(params.token);
  if (!pkg) notFound();

  // Bump the counter (and, on first view, notify operations) without blocking the render.
  waitUntil(recordSupervisorView(params.token));

  const summaryBits = [
    `${pkg.totals.total} verified references`,
    pkg.totals.withPdf > 0 ? `${pkg.totals.withPdf} with downloadable PDFs` : null,
    pkg.totals.paywalled > 0 ? `${pkg.totals.paywalled} available through your university library` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const cs = pkg.citationSummary;
  const summaryStrip = [
    cs.totalCitations > 0 ? `${cs.totalCitations.toLocaleString()} total citations` : null,
    cs.medianYear ? `median year ${cs.medianYear}` : null,
    cs.topCited && cs.topCited.citations > 0
      ? `most cited: ${cs.topCited.authors ? cs.topCited.authors.split(";")[0]?.split(",")[0]?.trim() : cs.topCited.title.slice(0, 40)}${cs.topCited.year ? ` (${cs.topCited.year})` : ""} · ${cs.topCited.citations.toLocaleString()} citations`
      : null,
    cs.downloadable > 0 ? `${cs.downloadable} downloadable PDFs on this page` : null,
  ].filter(Boolean);

  return (
    <main className="mx-auto max-w-4xl px-5 py-10 print:px-0 print:py-6">
      <header className="border-b border-border/60 pb-6">
        <div className="flex items-center gap-3">
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
          <div className="ml-auto text-xs uppercase tracking-wider text-muted-foreground">Reference bibliography</div>
        </div>
        <h1 className="mt-6 text-2xl font-semibold text-foreground sm:text-3xl">{pkg.projectTitle ?? pkg.projectCode}</h1>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm text-muted-foreground">
          {pkg.supervisorName ? <span>Prepared for {pkg.supervisorName}</span> : null}
          {pkg.universityName ? <span>{pkg.universityName}</span> : null}
          {pkg.department ? <span>{pkg.department}</span> : null}
          <span>Prepared {formatDate(pkg.preparedAt)}</span>
        </div>
        <p className="mt-4 rounded-xl bg-zone px-4 py-3 text-sm text-foreground">{summaryBits}</p>
        {summaryStrip.length > 0 ? (
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {summaryStrip.map((bit, i) => (
              <span key={i}>{i > 0 ? "· " : ""}{bit}</span>
            ))}
          </p>
        ) : null}
      </header>

      <TierSection
        title="Core references"
        intro="The base literature this project builds on."
        withPdf={pkg.key.withPdf}
        paywalled={pkg.key.paywalled}
        token={params.token}
      />
      <TierSection
        title="Closely related"
        intro="Papers that support the project's methods and background."
        withPdf={pkg.supporting.withPdf}
        paywalled={pkg.supporting.paywalled}
        token={params.token}
      />

      {pkg.totals.paywalled > 0 ? (
        <section className="mt-10 rounded-xl border border-border/60 bg-zone px-5 py-4 text-sm text-foreground">
          <p className="font-medium">How to read the paywalled references</p>
          <p className="mt-1 text-muted-foreground">
            The papers marked <em>Get from library</em> are behind a subscription. Click the DOI link — the
            publisher&apos;s page opens directly, and your university library&apos;s subscription usually gives full access.
          </p>
        </section>
      ) : null}

      <section className="mt-10 flex flex-wrap gap-3 print:hidden">
        <a
          href={`/api/research/${params.token}/references-doc`}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:border-primary/40"
        >
          <LuFileText className="size-4" aria-hidden />
          Download the full reference list (.docx)
        </a>
        {pkg.totals.paywalled > 0 ? (
          <a
            href={`/api/research/${params.token}/paywalled.docx`}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:border-primary/40"
          >
            <LuFileText className="size-4" aria-hidden />
            Download paywalled references (.docx)
          </a>
        ) : null}
      </section>

      <footer className="mt-14 border-t border-border/60 pt-6 text-center text-xs text-muted-foreground">
        <p>All references verified through OpenAlex.</p>
        <p className="mt-1">
          <span className="font-semibold text-foreground">EduCraft</span> — Providing Affordable Academic Services.
        </p>
      </footer>
    </main>
  );
}
