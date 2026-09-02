import { NextResponse } from "next/server";

import { createConfiguredRunService } from "@/features/workflows/runs/run-service-server";
import { currentWorkflowDataMode } from "@/features/workflows/data/repository";
import { runErrorPayload } from "@/features/workflows/runs/run-response";

export async function POST(request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  if (currentWorkflowDataMode() === "demo") {
    return NextResponse.json({ runId: `demo-replay-${Date.now()}`, status: "queued", workflowVersionId: versionId }, { status: 202 });
  }
  const configured = createConfiguredRunService();
  try {
    const body = await request.json();
    const result = await configured.service.replayRun({ workflowVersionId: versionId, variables: body.variables ?? {} });
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    const mapped = runErrorPayload(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  } finally {
    await configured.close();
  }
}
