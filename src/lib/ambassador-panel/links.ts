import type { AmbassadorKind } from "@/lib/ambassador-panel/types";

/**
 * Referral link paths, exactly as the original app issued them:
 *
 *   general   /EduCraftA/007
 *   core      /ECCA/ECCA-001          (recruitment link)
 *   sub       /ECSA/-001-001          (client link — the "ECSA" prefix is dropped)
 *
 * Shared by the server (welcome emails) and the panel UI (copy buttons).
 */
export function kindOf(id: string): AmbassadorKind {
  if (id.toUpperCase().startsWith("ECCA-")) return "core";
  if (id.toUpperCase().startsWith("ECSA-")) return "sub";
  return "general";
}

export function referralPath(id: string): string {
  switch (kindOf(id)) {
    case "core":
      return `/ECCA/${id}`;
    case "sub":
      return `/ECSA/${id.replace(/^ECSA/i, "")}`;
    default:
      return `/EduCraftA/${id}`;
  }
}

export function referralUrl(origin: string, id: string): string {
  return `${origin.replace(/\/$/, "")}${referralPath(id)}`;
}

/** Display label for a general slot ID: "007" → "EduCraftA-007". */
export function slotLabel(id: string): string {
  return kindOf(id) === "general" ? `EduCraftA-${id}` : id;
}

/** "7" / "007" → "007". Core and sub IDs are upper-cased, never padded. */
export function normaliseId(raw: string): string {
  const id = raw.trim().toUpperCase();
  if (id.startsWith("ECCA-") || id.startsWith("ECSA-")) return id;
  return id.padStart(3, "0");
}
