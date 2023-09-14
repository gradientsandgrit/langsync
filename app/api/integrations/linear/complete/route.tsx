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

  const params = new URLSearchParams();
  params.set("grant_type", "authorization_code");
  params.set("code", code);
  params.set(
    "redirect_uri",
    process.env.LINEAR_INTEGRATION_OAUTH_REDIRECT_URI!,
  );
  params.set("client_id", process.env.LINEAR_INTEGRATION_OAUTH_CLIENT_ID!);
  params.set(
    "client_secret",
    process.env.LINEAR_INTEGRATION_OAUTH_CLIENT_SECRET!,
  );

  const resp = await fetch(`https://api.linear.app/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  if (!resp.ok) {
    if (resp.status === 400) {
      console.log(await resp.text());

      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }
    await reportEvent("linear_integration_error", {
      accountId: account.id,
      error: await resp.text(),
    });
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 },
    );
  }

  const { access_token, token_type, expires_in, scope } = await resp.json();

  let org;
  {
    // https://studio.apollographql.com/public/Linear-API/variant/current/explorer
    const orgDetailsResp = await fetch(`https://api.linear.app/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${token_type} ${access_token}`,
        // Create signed URL for organization logo valid for a year
        "public-file-urls-expire-in": (60 * 60 * 24 * 31 * 12).toString(), // 1 year
      },
      body: JSON.stringify({
        query: `
        query getOrganization {
          organization {
            id
            name
            logoUrl
          }
        }
      `,
      }),
    });
    if (!orgDetailsResp.ok) {
      await reportEvent("linear_integration_error", {
        accountId: account.id,
        error: await orgDetailsResp.text(),
      });
      return NextResponse.json(
        { error: "Something went wrong" },
        { status: 500 },
      );
    }
    const orgDetailsBody = await orgDetailsResp.json();
    org = orgDetailsBody.data.organization;
  }

  // This process is idempotent, we can easily refresh connections
  await updateIntegrationConnection(
    sql,
    account.id,
    Integration.Linear,
    {
      access_token,
      token_type,
      expires_in,
      scope,
      organization_id: org.id,
      organization_name: org.name,
      organization_logo: org.logoUrl,
    },
    new Date().toISOString(),
    org.id,
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
