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
      // D9: the orchestrator's tick starts chapters and drafts data requests; the internal gate; Start's rehearsal; Continue.
      "/api/internal/orchestrator/tick": ["./prompts/**/*"],
      "/api/internal/quality/run": ["./prompts/**/*"],
      "/api/admin/projects/[id]/generation/start": ["./prompts/**/*"],
      "/api/admin/projects/[id]/generation/continue": ["./prompts/**/*"],
      "/api/admin/projects/[id]/data-pause": ["./prompts/**/*"],
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "https", hostname: "res.cloudinary.com" },
    ],
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
