import { referralResponse } from "@/lib/ambassador-panel/redirect";

export const dynamic = "force-dynamic";

/** Sub-Ambassador client link — /ECSA/-001-001 → WhatsApp. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  return referralResponse("ecsa", params.id, req);
}
