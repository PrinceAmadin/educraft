/**
 * Unpaywall resolves a DOI to a real, fetchable open-access PDF location.
 * A reference only survives this step if there's an actual OA copy that
 * genuinely serves a PDF — directly enforcing "exclude references where the
 * PDF is unlikely to fetch successfully." Unpaywall's own "is_oa: true" is
 * not trusted blindly: its data can be stale (a paper delisted, a host now
 * blocking automated fetches), so the resolved URL is actually probed.
 */

const UNPAYWALL_BASE_URL = "https://api.unpaywall.org/v2";

function contactEmail(): string {
  return process.env.RESEARCH_CONTACT_EMAIL || "educraft611@gmail.com";
}

export interface OpenAccessResult {
  isOpenAccess: boolean;
  pdfUrl: string | null;
}

/** Probes a URL with a tiny range request and confirms it actually serves a PDF. */
async function verifyServesPdf(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/pdf", Range: "bytes=0-1023" },
    });
    if (!res.ok && res.status !== 206) return false;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("pdf")) return true;
    // Some hosts omit/mislabel content-type — fall back to the PDF magic bytes.
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.subarray(0, 5).toString("latin1") === "%PDF-";
  } catch {
    return false;
  }
}

export async function resolveOpenAccessPdf(doi: string): Promise<OpenAccessResult> {
  const email = contactEmail();
  let res: Response;
  try {
    res = await fetch(`${UNPAYWALL_BASE_URL}/${encodeURIComponent(doi)}?email=${encodeURIComponent(email)}`);
  } catch {
    return { isOpenAccess: false, pdfUrl: null };
  }
  if (!res.ok) return { isOpenAccess: false, pdfUrl: null };

  const json = await res.json().catch(() => null);
  if (!json?.is_oa) return { isOpenAccess: false, pdfUrl: null };

  // Only a direct PDF link counts — a landing/abstract page (best.url) is not
  // "the PDF" even when Unpaywall attaches it as the best OA location.
  const pdfUrl: string | null = json.best_oa_location?.url_for_pdf || null;
  if (!pdfUrl) return { isOpenAccess: false, pdfUrl: null };

  const reachable = await verifyServesPdf(pdfUrl);
  return { isOpenAccess: reachable, pdfUrl: reachable ? pdfUrl : null };
}
