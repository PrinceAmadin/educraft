import type { MetadataRoute } from "next";

/**
 * Served at /manifest.webmanifest. `start_url` is /dashboard, which sends a signed-in
 * person to their own portal by role and everyone else to /login — one installed app
 * for admins, workers and ambassadors.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: "EduCraft HQ",
    short_name: "EduCraft",
    description: "EduCraft operations — projects, assignments, earnings and referrals.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F8F9FA",
    theme_color: "#0D9488",
    categories: ["business", "productivity", "education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
