import { NextResponse } from "next/server";

import { RuntimeSecretConfigurationError, RuntimeSecretDecryptionError } from "@/features/workflows/runtime-values/crypto";
import { RuntimeValuesValidationError } from "@/features/workflows/runtime-values/field-registry";
import { createConfiguredRuntimeValuesService } from "@/features/workflows/runs/run-service-server";
import { createDatabasePool } from "@/lib/db/client";
import { createWorkflowVersionsRepository } from "@/features/workflows/versions/repository";

function errorResponse(error: unknown) {
  if (error instanceof RuntimeValuesValidationError) return NextResponse.json({ error: "Runtime values are invalid", fieldErrors: error.fieldErrors }, { status: 422 });
  if (error instanceof RuntimeSecretConfigurationError || error instanceof RuntimeSecretDecryptionError) return NextResponse.json({ error: error.message }, { status: 500 });
  if (error instanceof Error && error.message === "Test case not found") return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ error: "Unable to process runtime values" }, { status: 500 });
}

export async function GET(request: Request, { params }: { params: Promise<{ testCaseId: string }> }) {
  const { testCaseId } = await params;
  const configured = createConfiguredRuntimeValuesService();
  try {
    const versionId = new URL(request.url).searchParams.get("workflowVersionId");
    if (!versionId) return NextResponse.json(await configured.service.getForGraph(testCaseId));
    const pool = createDatabasePool();
    try {
      const version = await createWorkflowVersionsRepository(pool).get(versionId);
      if (!version || version.testCaseId !== testCaseId) return NextResponse.json({ error: "Workflow version not found" }, { status: 404 });
      return NextResponse.json(await configured.service.getForGraph(testCaseId, version.graph));
    } finally {
      await pool.end();
    }
  } catch (error) {
    return errorResponse(error);
  } finally {
    await configured.close();
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ testCaseId: string }> }) {
  const { testCaseId } = await params;
  const configured = createConfiguredRuntimeValuesService();
  try {
    const body = await request.json();
    const prepared = await configured.service.persist(testCaseId, body.values ?? {});
    return NextResponse.json({ values: prepared.workerVariables });
  } catch (error) {
    return errorResponse(error);
  } finally {
    await configured.close();
  }
}
