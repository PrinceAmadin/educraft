import { safeHref } from "@/lib/safe-href";

/**
 * Where a file link should point. Private files only through a download
 * route (which checks the caller); older files are their stored https link.
 * `routeBase` is the caller's project API path, e.g.
 * "/api/worker/projects/EC-00008".
 */
export function fileHref(
  file: { id: string; storage: string; fileUrl: string },
  routeBase: string
): string | null {
  if (file.storage === "PRIVATE_BLOB") return `${routeBase}/files/${encodeURIComponent(file.id)}`;
  return safeHref(file.fileUrl);
}
