import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { NextResponse } from "next/server";

import { currentWorkflowDataMode } from "@/features/workflows/data/repository";
import { ArtifactPathError, resolveArtifactPath } from "../../resolve-artifact";

const contentTypes: Record<string, string> = {
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".zip": "application/zip",
  ".txt": "text/plain; charset=utf-8",
  ".log": "text/plain; charset=utf-8",
};

const demoArtifacts: Record<string, string> = {
  "steps/verify-before.png": "/demo-artifacts/failed-before.png",
  "steps/verify-after.png": "/demo-artifacts/failed-after.png",
};

export async function GET(request: Request, { params }: { params: Promise<{ runId: string; path: string[] }> }) {
  try {
    const { runId, path } = await params;
    const demoArtifact = currentWorkflowDataMode() === "demo" && runId.startsWith("demo-")
      ? demoArtifacts[path.join("/")]
      : undefined;
    if (demoArtifact) return NextResponse.redirect(new URL(demoArtifact, request.url));
    const artifact = await resolveArtifactPath(process.env.ARTIFACTS_ROOT ?? "/artifacts", runId, path);
    return new NextResponse(await readFile(artifact), {
      headers: { "content-type": contentTypes[extname(artifact).toLowerCase()]!, "x-content-type-options": "nosniff" },
    });
  } catch (error) {
    const status = error instanceof ArtifactPathError ? error.status : 404;
    return NextResponse.json({ error: status === 400 ? "Invalid artifact request" : "Artifact not found" }, { status });
  }
}
