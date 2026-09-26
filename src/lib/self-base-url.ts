/**
 * Where this deployment can reach itself, for background jobs that hand their
 * next slice to a fresh function invocation (research, chapter generation).
 * Deliberately not the Paystack callback URL: that one may be an override for
 * a custom domain, whereas this must be an address that serves this very
 * deployment. RESEARCH_BASE_URL overrides it for both jobs.
 */
export function selfBaseUrl(): string {
  if (process.env.RESEARCH_BASE_URL) return process.env.RESEARCH_BASE_URL;
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
