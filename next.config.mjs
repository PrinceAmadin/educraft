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
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "https", hostname: "res.cloudinary.com" },
    ],
  },
};

export default nextConfig;
