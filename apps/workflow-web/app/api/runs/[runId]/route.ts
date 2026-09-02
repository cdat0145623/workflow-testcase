import { NextResponse } from "next/server";

import { createConfiguredRunService } from "@/features/workflows/runs/run-service-server";
import { WorkerHttpError } from "@/features/workflows/runs/worker-client";
import { currentWorkflowDataMode } from "@/features/workflows/data/repository";

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (currentWorkflowDataMode() === "demo" && runId.startsWith("demo-")) {
    const created = Number(runId.split("-").at(-1));
    const active = Date.now() - created < 1_500;
    const failed = runId.includes("-fail-");
    const status = active ? "running" : failed ? "failed" : "passed";
    return NextResponse.json({
      id: runId,
      workflowVersionId: "demo-version-1",
      status,
      createdAt: new Date(created).toISOString(),
      steps: [
        { runId, stepId: "open", type: "open_url", status: "passed", durationMs: 182 },
        { runId, stepId: "verify", type: "expect_visible", status: active ? "running" : failed ? "failed" : "passed", ...(failed && !active ? { error: "Expected page-ready element was not visible" } : {}) },
      ],
    });
  }
  const configured = createConfiguredRunService();
  try {
    return NextResponse.json(await configured.service.getRun(runId));
  } catch (error) {
    const status = error instanceof WorkerHttpError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status });
  } finally {
    await configured.close();
  }
}
