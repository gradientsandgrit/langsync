import { NextRequest, NextResponse } from "next/server";

import { sql } from "@vercel/postgres";
import { verifyJwtMiddleware } from "@/app/api/auth/callback/jwt";
import {
  findAccountById,
  getPipeline,
  getPipelineRun,
  getPipelineRunSteps,
} from "@/app/api/auth/callback/db";

export const runtime = "edge";

export async function GET(
  request: NextRequest,
  { params }: { params: { pipelineId: string; runId: string } },
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

  const run = await getPipelineRun(sql, params.runId);
  if (!run || run.pipeline !== params.pipelineId) {
    return NextResponse.json({ error: "Invalid pipeline" }, { status: 404 });
  }

  const steps = await getPipelineRunSteps(sql, params.runId);

  return NextResponse.json(steps);
}
