/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * `next dev` and `next build` both write to `.next`, so running a production
   * build while a dev server is up corrupts both — the symptom is a 500 with
   * "Cannot find module ./vendor-chunks/…". Setting NEXT_DIST_DIR gives a run
   * its own output directory:
   *
   *   NEXT_DIST_DIR=.next-verify npx next build
   *   NEXT_DIST_DIR=.next-verify npx next start -p 3210
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",

  reactStrictMode: true,

  /**
   * The prompt library is read from disk at run time (src/lib/generation/prompt-loader.ts,
   * the quality gate's voice rules, the data request's checklist). Routes that start a
   * chapter, run the gate or draft a data request need prompts/ in their function
   * bundle, or Vercel's file tracing leaves it out.
   */
  experimental: {
    outputFileTracingIncludes: {
      "/api/admin/projects/[id]/quality/run": ["./prompts/**/*"],
      "/api/worker/projects/[id]/quality/run": ["./prompts/**/*"],
      "/api/admin/projects/[id]/quality/regenerate": ["./prompts/**/*"],
      // Chapter review: rebuilding from the approved chapters runs the gate (the preliminary pages read prompts/).
      "/api/admin/projects/[id]/report/rebuild": ["./prompts/**/*"],
      // Chapter gate: a chapter's check reads the voice rules in prompts/shared (the internal run, and an admin
      // upload approved at once, which waits for its check).
      "/api/internal/chapter-check/run": ["./prompts/**/*"],
      "/api/admin/projects/[id]/chapters/[n]/check": ["./prompts/**/*"],
      "/api/admin/projects/[id]/deliverables/[deliverableId]/upload": ["./prompts/**/*"],
      // D9: the orchestrator's tick starts chapters and drafts data requests; the internal gate; Start's rehearsal; Continue.
      "/api/internal/orchestrator/tick": ["./prompts/**/*"],
      "/api/internal/quality/run": ["./prompts/**/*"],
      "/api/admin/projects/[id]/generation/start": ["./prompts/**/*"],
      "/api/admin/projects/[id]/generation/continue": ["./prompts/**/*"],
      "/api/admin/projects/[id]/data-pause": ["./prompts/**/*"],
      // D10: the preliminary-pages agent is fired inline from the two quality-run routes
      // above (already traced) and from a founder/COO-only retry route.
      "/api/admin/projects/[id]/generation/preliminary-pages": ["./prompts/**/*"],
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "https", hostname: "res.cloudinary.com" },
    ],
  },

  async redirects() {
    return [
      {
        /**
         * The QR on a printed card encodes `/J/{CODE}` in capitals, because a
         * QR code can only use its compact alphanumeric mode for digits and
         * capitals — one lowercase character forces the denser byte mode and a
         * symbol that is harder to scan in poor light. Anyone who TYPES the
         * address off the card will use lower case, so it has to work too.
         */
        source: "/j/:token",
        destination: "/J/:token",
        permanent: true,
      },
    ];
  },

  async headers() {
    return [
      {
        // The service worker must never be served from a stale HTTP cache, or a
        // fix to it would not reach installed apps.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
