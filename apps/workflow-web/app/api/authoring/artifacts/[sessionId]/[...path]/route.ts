import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { NextResponse } from "next/server";

import { resolveAuthoringArtifact } from "@/features/authoring/artifacts";

const contentTypes: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string; path: string[] }> }) {
  try {
    const { sessionId, path } = await params;
    if (!/^[a-f0-9-]{36}$/i.test(sessionId) || path.length !== 1 || !/^[a-f0-9-]{36}\.(png|jpg)$/i.test(path[0]!)) {
      return NextResponse.json({ error: "Invalid artifact request" }, { status: 400 });
    }
    const artifact = await resolveAuthoringArtifact(process.env.ARTIFACTS_ROOT ?? "/artifacts", `authoring/${sessionId}/${path[0]}`);
    const contentType = contentTypes[extname(artifact).toLowerCase()];
    if (!contentType) return NextResponse.json({ error: "Unsupported artifact type" }, { status: 400 });
    return new NextResponse(await readFile(artifact), { headers: { "content-type": contentType, "x-content-type-options": "nosniff" } });
  } catch {
    return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  }
}
