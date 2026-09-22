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

  // OPS_MANAGER can update company/bank info but never pricing — enforced
  // here regardless of what the client sent (CLAUDE.md: "no pricing changes").
  const data =
    guard.session.role === "SUPER_ADMIN"
      ? parsed.data
      : {
          companyName: parsed.data.companyName,
          companyPhone: parsed.data.companyPhone,
          companyEmail: parsed.data.companyEmail,
          bankName: parsed.data.bankName,
          accountNumber: parsed.data.accountNumber,
          accountName: parsed.data.accountName,
        };
  // parentCommissionRate is omitted from that object like commissionRates —
  // pricing, so OPS_MANAGER can't touch it. alertEmails is omitted too: where
  // the founder's alerts go is the founder's call.

  try {
    await updateGeneralSettings(data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError("PATCH /api/admin/settings", error);
  }
}
