import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { waitUntil } from "@vercel/functions";
import Image from "next/image";
import { LuDownload, LuExternalLink, LuFileText } from "react-icons/lu";
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
        </div>
        <div className="shrink-0 print:hidden">
          {r.hasPdf ? (
            <a
              href={`/api/research/${token}/pdf/${r.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-soft hover:bg-primary/90"
            >
              <LuDownload className="size-4" aria-hidden /> PDF
            </a>
          ) : r.doi ? (
            <a
              href={`https://doi.org/${r.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
            >
              <LuExternalLink className="size-4" aria-hidden /> Get from library
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function Section({
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
  if (withPdf.length + paywalled.length === 0) return null;
  return (
    <section className="mt-10">
      <div className="border-b border-border/60 pb-2">
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{intro}</p>
      </div>
      {withPdf.length > 0 ? (
        <>
          <p className="mt-6 text-sm font-medium text-foreground">Downloadable ({withPdf.length})</p>
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
      </header>

      <Section
        title="Key references"
        intro="The base literature this project builds on."
        withPdf={pkg.key.withPdf}
        paywalled={pkg.key.paywalled}
        token={params.token}
      />
      <Section
        title="Supporting references"
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
