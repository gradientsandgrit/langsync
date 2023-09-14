import { verifyJwtMiddleware } from "@/app/api/auth/callback/jwt";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import {
  findAccountById,
  getPipeline,
  PipelineRunTrigger,
  updatePipeline,
  withTransaction,
} from "@/app/api/auth/callback/db";
import { dispatchPipeline } from "@/app/api/pipelines/dispatch";

export const runtime = "edge";

export async function GET(
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

  return NextResponse.json(pipeline, { status: 200 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { pipelineId: string } },
) {
  const res = await verifyJwtMiddleware(request);
  if ("error" in res) {
    return NextResponse.json(res, { status: 401 });
  }

  return await withTransaction(async (sql) => {
    const account = await findAccountById(sql, res.accountId);

    if (!account || account.is_suspended) {
      return NextResponse.json({ error: "Invalid account" }, { status: 401 });
    }

    const pipeline = await getPipeline(sql, account.id, params.pipelineId);
    if (!pipeline) {
      return NextResponse.json({ error: "Invalid pipeline" }, { status: 404 });
    }
    const { config, is_enabled } = await request.json();

    await updatePipeline(
      sql,
      account.id,
      params.pipelineId,
      config || pipeline.config,
      typeof is_enabled === "boolean" ? is_enabled : pipeline.is_enabled,
    );

    if (!pipeline.is_enabled && is_enabled) {
      await dispatchPipeline(sql, pipeline, PipelineRunTrigger.System);
    }

    return NextResponse.json({}, { status: 200 });
  });
}
