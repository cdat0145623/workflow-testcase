import { NextResponse } from "next/server";
import { createDatabasePool } from "@/lib/db/client";
import { createWorkflowVersionsRepository } from "@/features/workflows/versions/repository";
export async function GET(_request: Request, { params }: { params: Promise<{ testCaseId: string }> }) { const { testCaseId } = await params; const pool = createDatabasePool(); try { return NextResponse.json(await createWorkflowVersionsRepository(pool).list(testCaseId)); } finally { await pool.end(); } }
