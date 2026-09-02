import { NextResponse } from "next/server";
import { createDatabasePool } from "@/lib/db/client";
import { createWorkflowVersionsRepository } from "@/features/workflows/versions/repository";
export async function GET(_request: Request, { params }: { params: Promise<{ versionId: string }> }) { const { versionId } = await params; const pool = createDatabasePool(); try { const version = await createWorkflowVersionsRepository(pool).get(versionId); return version ? NextResponse.json(version) : NextResponse.json({ error: "Workflow version not found" }, { status: 404 }); } finally { await pool.end(); } }
