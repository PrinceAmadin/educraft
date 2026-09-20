import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { deviceCookieName } from "@/lib/pro-bono";
import { ProBonoError, inviteIdForToken, submitThroughInvite } from "@/lib/services/probono";
import { intakeSubmitSchema } from "@/lib/validations/intake";

/** Public. Only the device the link is locked to can submit, and only once. */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const parsed = intakeSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check the form", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const inviteId = await inviteIdForToken(params.token);
    if (!inviteId) return NextResponse.json({ error: "This link is not valid" }, { status: 404 });

    const secret = cookies().get(deviceCookieName(inviteId))?.value ?? null;
    const result = await submitThroughInvite(params.token, secret, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ProBonoError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("[POST /api/probono/submit]", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
