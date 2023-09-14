import { verifyJwtMiddleware } from "@/app/api/auth/callback/jwt";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import {
  findAccountById,
  getIntegrationConnections,
} from "@/app/api/auth/callback/db";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const res = await verifyJwtMiddleware(req);
  if ("error" in res) {
    return NextResponse.json(res, { status: 401 });
  }

  const account = await findAccountById(sql, res.accountId);

  if (!account || account.is_suspended) {
    return NextResponse.json({ error: "Invalid account" }, { status: 401 });
  }

  const connections = await getIntegrationConnections(sql, account.id);

  return NextResponse.json(connections, { status: 200 });
}
