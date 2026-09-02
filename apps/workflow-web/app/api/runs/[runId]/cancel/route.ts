import { NextResponse } from "next/server";

import { createConfiguredRunService } from "@/features/workflows/runs/run-service-server";
import { WorkerHttpError } from "@/features/workflows/runs/worker-client";
import { currentWorkflowDataMode } from "@/features/workflows/data/repository";

export async function POST(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (currentWorkflowDataMode() === "demo" && runId.startsWith("demo-")) {
    return NextResponse.json({ id: runId, workflowVersionId: "demo-version-1", status: "cancelled", createdAt: new Date().toISOString(), steps: [] });
  }
  const configured = createConfiguredRunService();
  try {
    return NextResponse.json(await configured.service.cancelRun(runId));
  } catch (error) {
    const status = error instanceof WorkerHttpError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status });
  } finally {
    await configured.close();
  }
}
