import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { generalSettingsSchema } from "@/lib/validations/settings";
import { updateGeneralSettings } from "@/lib/services/settings";

export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Expected a JSON body");
  }

  const parsed = generalSettingsSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form", parsed.error.flatten());

  // Only the founder changes the HQ contact (the number every ambassador link
  // opens, the mailbox in every footer), where the alerts go and the ₦/$ rate.
  // Any other staff login that reaches this route may only touch the bank
  // details — enforced here regardless of what the client sent.
  const data =
    guard.session.role === "SUPER_ADMIN"
      ? parsed.data
      : {
          bankName: parsed.data.bankName,
          accountNumber: parsed.data.accountNumber,
          accountName: parsed.data.accountName,
        };

  try {
    const { contactChanges } = await updateGeneralSettings(data, { userId: guard.session.userId });
    return NextResponse.json({ ok: true, contactChanges });
  } catch (error) {
    return serverError("PATCH /api/admin/settings", error);
  }
}
