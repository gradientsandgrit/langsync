import { verifyJwtMiddleware } from "@/app/api/auth/callback/jwt";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import {
  findAccountById,
  getPipeline,
  getPipelineRuns,
} from "@/app/api/auth/callback/db";

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

  const runs = await getPipelineRuns(sql, pipeline.id, 25);
  return NextResponse.json(runs);
}
