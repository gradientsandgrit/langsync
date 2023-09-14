import { NextRequest, NextResponse } from "next/server";
import { reportEvent } from "@/app/monitoring";
import { verifyJwtMiddleware } from "@/app/api/auth/callback/jwt";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const res = await verifyJwtMiddleware(req);
  if ("error" in res) {
    return NextResponse.json(res, { status: 401 });
  }

  await reportEvent("logout", { accountId: res.accountId });

  const undoCookie = `langsync-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Strict;`;

  return new Response(JSON.stringify({ bye: true }), {
    status: 200,
    headers: { "Set-Cookie": undoCookie },
  });
}
