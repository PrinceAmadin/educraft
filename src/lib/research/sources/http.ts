/**
 * The one way the source stage calls an outside archive or court: an honest
 * User-Agent with a contact address, a timeout, and at most one request a
 * second to any host (the rate The National Archives asks for; the others
 * publish no limit, so the same courtesy applies).
 */

const CONTACT = process.env.RESEARCH_CONTACT_EMAIL || "educraft611@gmail.com";
export const SOURCE_USER_AGENT = `EduCraftResearch/1.0 (+https://educraft-hq.vercel.app; ${CONTACT})`;

const MIN_GAP_MS = 1_000;
const lastCall = new Map<string, number>();

export class SourceHttpError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
  }
}

async function waitTurn(host: string): Promise<void> {
  const last = lastCall.get(host) ?? 0;
  const wait = last + MIN_GAP_MS - Date.now();
  lastCall.set(host, Math.max(Date.now(), last + MIN_GAP_MS));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

export async function politeFetch(url: string, init: { timeoutMs?: number; accept?: string } = {}): Promise<Response> {
  const host = new URL(url).hostname;
  await waitTurn(host);
  try {
    return await fetch(url, {
      headers: { "User-Agent": SOURCE_USER_AGENT, Accept: init.accept ?? "application/json" },
      signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
      cache: "no-store",
    });
  } catch (error) {
    throw new SourceHttpError(`${host} did not answer: ${error instanceof Error ? error.message : String(error)}`, null);
  }
}

export async function politeFetchJson<T>(url: string, timeoutMs?: number): Promise<T> {
  const res = await politeFetch(url, { timeoutMs });
  if (!res.ok) throw new SourceHttpError(`${new URL(url).hostname} answered ${res.status}`, res.status);
  try {
    return (await res.json()) as T;
  } catch {
    throw new SourceHttpError(`${new URL(url).hostname} did not answer with JSON`, res.status);
  }
}
