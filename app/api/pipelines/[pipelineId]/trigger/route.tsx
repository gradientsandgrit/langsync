import { NextRequest, NextResponse } from "next/server";
import { verifyJwtMiddleware } from "@/app/api/auth/callback/jwt";
import {
  findAccountById,
  getPipeline,
  PipelineRunTrigger,
} from "@/app/api/auth/callback/db";
import { sql } from "@vercel/postgres";
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

  if (!pipeline.is_enabled) {
    return NextResponse.json(
      { error: "Pipeline is disabled" },
      { status: 400 },
    );
  }

  await dispatchPipeline(sql, pipeline, PipelineRunTrigger.Manual);

  return NextResponse.json({ ok: true }, { status: 200 });
}
