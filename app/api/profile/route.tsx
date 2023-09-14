import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import {
  findAccountById,
  updateAgreeToTerms,
  updateName,
  withTransaction,
} from "@/app/api/auth/callback/db";
import { verifyJwtMiddleware } from "@/app/api/auth/callback/jwt";

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

  return new Response(JSON.stringify(account), {
    status: 200,
  });
}

export async function PATCH(req: NextRequest) {
  const { name, agreeToTerms } = await req.json();

  const res = await verifyJwtMiddleware(req);
  if ("error" in res) {
    return NextResponse.json(res, { status: 401 });
  }

  return await withTransaction(async (sql) => {
    const account = await findAccountById(sql, res.accountId);

    if (!account) {
      return NextResponse.json({ error: "Invalid account" }, { status: 401 });
    }

    if (typeof name === "string") {
      await updateName(sql, account.id, name);
    }
    if (typeof agreeToTerms === "boolean") {
      await updateAgreeToTerms(sql, account.id, agreeToTerms);
    }

    return new Response(JSON.stringify(account), {
      status: 200,
    });
  });
}
