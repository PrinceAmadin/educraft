import Link from "next/link";
import { LuBookOpen, LuDownload, LuExternalLink, LuFileText, LuLock } from "react-icons/lu";
import type { ClientDocument, ClientProjectView } from "@/lib/services/client-portal";
import { getClientDocuments } from "@/lib/services/client-portal";
import { getClientResearch } from "@/lib/services/client-research";
import { LOCK_TEXT } from "@/lib/files/policy";
import { cn, formatDate } from "@/lib/utils";

/**
 * The client's chapters and documents, and the research papers once EduCraft
 * has shared them. Downloads go through /api/client/... which applies the same
 * payment rule shown here. In the admin preview nothing downloads.
 */
export async function ClientDocumentsTab({
  view,
  basePath,
  preview,
}: {
  view: ClientProjectView;
  basePath: string;
  preview: boolean;
}) {
  const [documents, research] = await Promise.all([getClientDocuments(view.id), getClientResearch(view.id)]);
  const api = `/api/client/projects/${encodeURIComponent(view.code)}`;
  const anyLockedForBalance = documents.some((d) => d.lockReason === "balance");

  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Your documents</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Each part appears here once it has been checked and is ready for you.
          </p>
        </div>

        {documents.length === 0 ? (
          <p className="rounded-2xl bg-zone p-4 text-sm text-muted-foreground">Nothing here yet.</p>
        ) : (
          <ul className="divide-y divide-border/80">
            {documents.map((d) => (
              <DocumentRow key={d.id} doc={d} api={api} basePath={basePath} preview={preview} />
            ))}
          </ul>
        )}

        {anyLockedForBalance && view.canPayBalance ? (
          <p className="flex items-start gap-2 rounded-2xl bg-gold/10 p-4 text-sm text-foreground">
            <LuLock className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
            <span>
              Some parts unlock when your balance is paid.{" "}
              <Link href={`${basePath}?tab=payments`} className="font-medium text-primary hover:underline">
                Pay your balance
              </Link>
            </span>
          </p>
        ) : null}
      </section>

      {research ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Research papers</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {research.papers.length === 1 ? "1 paper" : `${research.papers.length} papers`} chosen for your topic.{" "}
              {research.downloadableCount === research.papers.length
                ? "All of them are free to download here."
                : `${research.downloadableCount === 1 ? "1 is" : `${research.downloadableCount} are`} free to download here; for the rest, your university library can give you the full text.`}
            </p>
          </div>
          {preview ? (
            <p className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-zone px-4 text-sm text-muted-foreground">
              <LuFileText className="size-4" aria-hidden />
              Reference list (Word)
            </p>
          ) : (
            <a
              href={`${api}/research/references`}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              <LuDownload className="size-4" aria-hidden />
              Download the reference list (Word)
            </a>
          )}
          <ul className="divide-y divide-border/80">
            {research.papers.map((p) => (
              <li key={p.id} className="flex items-start gap-3 py-3.5">
                <LuBookOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug text-foreground">{p.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[p.authors?.split(";").slice(0, 3).join(";"), p.year, p.journal].filter(Boolean).join(" · ")}
                  </p>
                  {!p.downloadable && p.doi ? (
                    <a
                      href={`https://doi.org/${encodeURI(p.doi)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      Access via your university library
                      <LuExternalLink className="size-3" aria-hidden />
                    </a>
                  ) : null}
                </div>
                {p.downloadable ? (
                  preview ? (
                    <span className="inline-flex size-10 shrink-0 items-center justify-center text-muted-foreground">
                      <LuDownload className="size-4" aria-hidden />
                    </span>
                  ) : (
                    <a
                      href={`${api}/research/papers/${p.id}`}
                      className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-primary transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Download ${p.title}`}
                    >
                      <LuDownload className="size-4" aria-hidden />
                    </a>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function DocumentRow({
  doc: d,
  api,
  basePath,
  preview,
}: {
  doc: ClientDocument;
  api: string;
  basePath: string;
  preview: boolean;
}) {
  const href = d.current ? `${api}/files/${d.current.fileId}` : null;
  return (
    <li className={cn("py-4", d.isFinal && d.state !== "not-ready" && "-mx-4 rounded-2xl bg-primary/5 px-4")}>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "inline-flex size-10 shrink-0 items-center justify-center rounded-xl",
            d.state === "open" ? "bg-primary/10 text-primary" : "bg-zone text-muted-foreground"
          )}
        >
          {d.state === "locked" ? <LuLock className="size-4" aria-hidden /> : <LuFileText className="size-4" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-foreground">{d.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {d.state === "not-ready"
              ? "Not ready yet"
              : d.state === "locked" && d.lockReason
                ? LOCK_TEXT[d.lockReason]
                : `Ready${d.current && d.current.releaseNo > 1 ? ` · version ${d.current.releaseNo}` : ""} · ${formatDate(d.current?.releasedAt)}`}
          </p>
        </div>
        {d.state === "open" && href ? (
          preview ? (
            <span className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-zone px-3 text-sm text-muted-foreground">
              <LuDownload className="size-4" aria-hidden />
              Download
            </span>
          ) : (
            <a
              href={href}
              className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              <LuDownload className="size-4" aria-hidden />
              Download
            </a>
          )
        ) : d.state === "locked" && d.lockReason === "balance" ? (
          <Link
            href={`${basePath}?tab=payments`}
            className="shrink-0 text-sm font-medium text-primary hover:underline"
          >
            Pay balance
          </Link>
        ) : null}
      </div>
      {d.state === "open" && d.earlier.length > 0 ? (
        <details className="mt-2 pl-[52px]">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            Earlier versions
          </summary>
          <ul className="mt-1.5 space-y-1">
            {d.earlier.map((v) => (
              <li key={v.fileId}>
                {preview ? (
                  <span className="text-xs text-muted-foreground">
                    Version {v.releaseNo} · {formatDate(v.releasedAt)}
                  </span>
                ) : (
                  <a href={`${api}/files/${v.fileId}`} className="inline-flex min-h-8 items-center gap-1.5 text-xs text-primary hover:underline">
                    <LuDownload className="size-3.5" aria-hidden />
                    Version {v.releaseNo} · {formatDate(v.releasedAt)}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}
