import { NextResponse } from "next/server";

import { createDatabasePool } from "@/lib/db/client";
import { createRunHistoryRepository } from "@/features/workflows/runs/run-history-repository";

export async function GET(request: Request, { params }: { params: Promise<{ testCaseId: string }> }) {
  const { testCaseId } = await params;
  const requestedLimit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
  const pool = createDatabasePool();
  try {
    return NextResponse.json(await createRunHistoryRepository(pool).list(testCaseId, requestedLimit));
  } finally {
    await pool.end();
  }
}
