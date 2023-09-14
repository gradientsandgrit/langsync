import { verifyJwtMiddleware } from "@/app/api/auth/callback/jwt";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import {
  findAccountById,
  getPipeline,
  getPipelineDocuments,
  PipelineRunTrigger,
  updatePipeline,
  withTransaction,
} from "@/app/api/auth/callback/db";
import { dispatchPipeline } from "@/app/api/pipelines/dispatch";

export const runtime = "edge";

export async function POST(
  request: NextRequest,
  { params }: { params: { pipelineId: string } },
) {
  const res = await verifyJwtMiddleware(request);
  if ("error" in res) {
    return NextResponse.json(res, { status: 401 });
  }

  const account = await findAccountById(sql, res.accountId);

  if (!account || account.is_suspended) {
    return NextResponse.json({ error: "Invalid account" }, { status: 401 });
  }

  const pipeline = await getPipeline(sql, account.id, params.pipelineId);
  if (!pipeline) {
    return NextResponse.json({ error: "Invalid pipeline" }, { status: 404 });
  }

  const { search } = await request.json();

  const documents = await getPipelineDocuments(
    sql,
    account.id,
    params.pipelineId,
    search,
  );

  return NextResponse.json(documents, { status: 200 });
}
