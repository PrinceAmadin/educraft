/**
 * The live site's address, for every link that leaves the app: email buttons,
 * referral links, unsubscribe links.
 *
 * Deliberately not the address of whatever is running the code. A local dev
 * server and a preview deployment both use the live database and the live
 * Gmail sender, so their emails reach real people, and a link to localhost or
 * to a preview URL would be dead on the reader's phone. (Paystack's return
 * address is different: it must come back to the server that started the
 * checkout, so it keeps using `callbackBaseUrl()` in `paystack.ts`.)
 *
 * Order: NEXT_PUBLIC_SITE_URL (set it when a custom domain is attached; an
 * http:// or localhost value is ignored), then Vercel's own production domain,
 * then the vercel.app address.
 */
export const LIVE_SITE_URL = "https://educraft-hq.vercel.app";

const LOCAL_HOST = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i;

export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured && configured.startsWith("https://") && !LOCAL_HOST.test(configured)) {
    return configured.replace(/\/+$/, "");
  }
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) return `https://${production.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return LIVE_SITE_URL;
}
