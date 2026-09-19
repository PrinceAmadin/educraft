import { referralResponse } from "@/lib/ambassador-panel/redirect";

export const dynamic = "force-dynamic";

/** Core Ambassador recruitment link — /ECCA/ECCA-001 → WhatsApp. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  return referralResponse("ecca", params.id, req);
}
