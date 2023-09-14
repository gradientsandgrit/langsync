import { NextRequest, NextResponse } from "next/server";
import { verifyJwtMiddleware } from "@/app/api/auth/callback/jwt";
import { sql } from "@vercel/postgres";
import {
  findAccountById,
  Integration,
  updateIntegrationConnection,
} from "@/app/api/auth/callback/db";
import { reportEvent } from "@/app/monitoring";

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

  const { code } = await req.json();

  const base64EncodedCredentials = Buffer.from(
    `${process.env.NOTION_INTEGRATION_OAUTH_CLIENT_ID}:${process.env.NOTION_INTEGRATION_OAUTH_CLIENT_SECRET}`,
  ).toString("base64");

  const resp = await fetch(`https://api.notion.com/v1/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${base64EncodedCredentials}`,
      "Notion-Version": "2022-06-28",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.NOTION_INTEGRATION_OAUTH_REDIRECT_URI,
    }),
  });
  if (!resp.ok) {
    if (resp.status === 400) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }
    await reportEvent("notion_integration_error", {
      accountId: account.id,
      error: await resp.text(),
    });
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 },
    );
  }

  const { access_token, bot_id, workspace_id, workspace_name, workspace_icon } =
    await resp.json();

  // This process is idempotent, we can easily refresh connections
  await updateIntegrationConnection(
    sql,
    account.id,
    Integration.Notion,
    {
      access_token,
      bot_id,
      workspace_id,
      workspace_name,
      workspace_icon,
    },
    new Date().toISOString(),
    workspace_id,
  );

  return NextResponse.json(
    {
      success: true,
    },
    {
      status: 200,
    },
  );
}
