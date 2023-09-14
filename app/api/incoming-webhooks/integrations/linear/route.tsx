import { NextRequest, NextResponse } from "next/server";
import {
  findIntegrationConnectionsByWorkspaceId,
  Integration,
  LinearDocumentType,
  withTransaction,
} from "@/app/api/auth/callback/db";
import {
  ChangeAction,
  dispatchChangePipeline,
} from "@/app/api/pipelines/dispatch";
import { sql } from "@vercel/postgres";

export const runtime = "edge";

const linearWebhookKey = crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(process.env.LINEAR_INTEGRATION_WEBHOOK_SECRET!),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"],
);

// https://developers.linear.app/docs/graphql/webhooks
export async function POST(req: NextRequest) {
  const originSignatureHexDigest = req.headers.get("linear-signature");
  if (!originSignatureHexDigest) {
    return new Response("Missing signature", { status: 400 });
  }

  const reqBody = await req.text();

  let originSignature;
  try {
    const matches = originSignatureHexDigest.match(/.{1,2}/g);
    if (!matches || matches.length !== 32) {
      throw new Error("Invalid signature");
    }
    originSignature = Uint8Array.from(
      matches.map((byte) => parseInt(byte, 16)),
    );
  } catch (e) {
    return new Response("Invalid signature", { status: 400 });
  }

  const signatureMatches = await crypto.subtle.verify(
    "HMAC",
    await linearWebhookKey,
    originSignature,
    new TextEncoder().encode(reqBody),
  );
  if (!signatureMatches) {
    return new Response("Invalid signature", { status: 400 });
  }

  const body = JSON.parse(reqBody);

  const {
    organizationId,
    action: linearAction,
    data: linearData,
    type: linearType,
  } = body;

  let documentAction: ChangeAction, documentId: string, documentType: string;
  switch (linearAction) {
    case "create":
      documentAction = ChangeAction.Create;
      break;
    case "update":
      documentAction = ChangeAction.Update;
      break;
    case "remove":
      documentAction = ChangeAction.Delete;
      break;
  }
  documentId = linearData.id;
  switch (linearType) {
    case "Issue":
      documentType = LinearDocumentType.Issue;
      break;
    default:
      // Don't handle other types for now
      return NextResponse.json({ ok: true }, { status: 200 });
  }

  // Find all integration connections connected to this workspace (could have multiple end users connected to the same Linear organization)
  const relatedConnections = await findIntegrationConnectionsByWorkspaceId(
    sql,
    organizationId,
  );

  // Dispatch the change to all related connections
  for (const relatedConnection of relatedConnections) {
    await withTransaction(async (sql) => {
      await dispatchChangePipeline(
        sql,
        relatedConnection.account,
        Integration.Linear,
        {
          action: documentAction,
          documentId,
          documentType,
        },
      );
    });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
