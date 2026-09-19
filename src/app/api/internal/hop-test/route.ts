import crypto from "crypto";
import https from "https";
import { NextRequest, NextResponse } from "next/server";

// TEMPORARY experiment — measures how deep a function can call itself on Vercel. Deleted after use.
export const maxDuration = 60;

const sig = () =>
  crypto.createHmac("sha256", process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "").update("hop-test").digest("hex");

function viaHttps(url: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: "GET", headers }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  if (q.get("token") !== sig()) return NextResponse.json({ error: "no" }, { status: 401 });
  const depth = Number(q.get("depth") ?? 0);
  const max = Number(q.get("max") ?? 8);
  const mode = q.get("mode") ?? "fetch";
  const seenId = req.headers.get("x-vercel-id");
  if (depth >= max) return NextResponse.json({ reachedDepth: depth, seenId });

  const base = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const next = `${base}/api/internal/hop-test?depth=${depth + 1}&max=${max}&mode=${mode}&token=${sig()}`;
  const headers: Record<string, string> = {};
  if (mode === "blankid") headers["x-vercel-id"] = "";
  try {
    if (mode === "https") {
      const r = await viaHttps(next, headers);
      return NextResponse.json({ depth, seenId, child: r.status === 200 ? JSON.parse(r.body) : { status: r.status, body: r.body.slice(0, 80) } });
    }
    const res = await fetch(next, { headers });
    const text = await res.text();
    return NextResponse.json({ depth, seenId, child: res.status === 200 ? JSON.parse(text) : { status: res.status, body: text.slice(0, 80) } });
  } catch (e) {
    return NextResponse.json({ depth, error: String(e) });
  }
}
