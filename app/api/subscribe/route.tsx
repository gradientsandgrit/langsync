import { NextRequest, NextResponse } from "next/server";

import {
  findAccountById,
  updateIsSubscriber,
  withTransaction,
} from "@/app/api/auth/callback/db";
import { verifyJwtMiddleware } from "@/app/api/auth/callback/jwt";
import { forceSubscribe } from "@/app/api/auth/callback/subscriber";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const res = await verifyJwtMiddleware(req);
  if ("error" in res) {
    return NextResponse.json(res, { status: 401 });
  }

  return await withTransaction(async (sql) => {
    const account = await findAccountById(sql, res.accountId);
    if (!account) {
      return NextResponse.json({ error: "Invalid account" }, { status: 401 });
    }

    if (account.is_subscriber) {
      return NextResponse.json({ success: true }, { status: 200 });
    }

    // Send subscription request to optiboy
    await forceSubscribe(account.email);

    await updateIsSubscriber(sql, account.email, true);

    return NextResponse.json({ success: true }, { status: 200 });
  });
}
