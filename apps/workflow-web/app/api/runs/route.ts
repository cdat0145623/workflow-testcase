import { NextResponse } from "next/server";

import { createConfiguredRunService } from "@/features/workflows/runs/run-service-server";
import { currentWorkflowDataMode } from "@/features/workflows/data/repository";

export async function POST(request: Request) {
  const body = await request.json();
  if (currentWorkflowDataMode() === "demo") {
    const failed = JSON.stringify(body.graph ?? {}).includes('"missing"');
    return NextResponse.json({ runId: `demo-${failed ? "fail" : "pass"}-${Date.now()}`, status: "queued", workflowVersionId: "demo-version-1" }, { status: 202 });
  }
  const configured = createConfiguredRunService();
  try {
    const result = body.action === "replay"
      ? await configured.service.replayRun({ workflowVersionId: String(body.workflowVersionId), variables: body.variables ?? {} })
      : await configured.service.startTestCaseRun({ testCaseId: String(body.testCaseId), graph: body.graph, variables: body.variables ?? {} });
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  } finally {
    await configured.close();
  }
}
