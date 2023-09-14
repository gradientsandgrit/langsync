import { NextRequest, NextResponse } from "next/server";
import { verifyJwtMiddleware } from "@/app/api/auth/callback/jwt";
import { sql } from "@vercel/postgres";
import {
  createIntegrationConnection,
  findAccountById,
  getIntegrationConnection,
  Integration,
  withTransaction,
} from "@/app/api/auth/callback/db";
import { disconnectIntegration } from "@/app/api/integrations/delete";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const res = await verifyJwtMiddleware(req);
  if ("error" in res) {
    return NextResponse.json(res, { status: 401 });
  }

  const account = await findAccountById(sql, res.accountId);

  if (!account || account.is_suspended) {
    return NextResponse.json({ error: "Invalid account" }, { status: 401 });
  }

  const existingConnection = await getIntegrationConnection(
    sql,
    account.id,
    Integration.Linear,
  );
  if (!existingConnection) {
    await createIntegrationConnection(sql, account.id, Integration.Linear);
  }

  const authorizeUrl = new URL("https://linear.app/oauth/authorize");
  authorizeUrl.searchParams.append(
    "client_id",
    process.env.LINEAR_INTEGRATION_OAUTH_CLIENT_ID!,
  );
  authorizeUrl.searchParams.append("response_type", "code");
  authorizeUrl.searchParams.append("scope", "read");
  authorizeUrl.searchParams.append("prompt", "consent");
  authorizeUrl.searchParams.append("actor", "user");
  authorizeUrl.searchParams.append(
    "redirect_uri",
    process.env.LINEAR_INTEGRATION_OAUTH_REDIRECT_URI!,
  );

  return NextResponse.json(
    {
      authorizeUrl: authorizeUrl.toString(),
    },
    {
      status: 200,
    },
  );
}

export async function DELETE(req: NextRequest) {
  const res = await verifyJwtMiddleware(req);
  if ("error" in res) {
    return NextResponse.json(res, { status: 401 });
  }

  const account = await findAccountById(sql, res.accountId);

  if (!account || account.is_suspended) {
    return NextResponse.json({ error: "Invalid account" }, { status: 401 });
  }

  const existingConnection = await getIntegrationConnection(
    sql,
    account.id,
    Integration.Linear,
  );
  if (!existingConnection) {
    return NextResponse.json({ error: "No connection" }, { status: 404 });
  }

  await withTransaction(async (sql) => {
    await disconnectIntegration(sql, account.id, Integration.Linear);
  });

  return NextResponse.json(
    {
      deleted: true,
    },
    {
      status: 200,
    },
  );
}
