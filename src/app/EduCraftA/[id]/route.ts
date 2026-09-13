import { referralResponse } from "@/lib/ambassador-panel/redirect";

export const dynamic = "force-dynamic";

/** General ambassador client link — /EduCraftA/007 → WhatsApp. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return referralResponse("ambassador", params.id);
}
