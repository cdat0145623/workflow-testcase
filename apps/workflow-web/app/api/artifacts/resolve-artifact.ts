import { realpath } from "node:fs/promises";
import { extname, isAbsolute, join, sep } from "node:path";

const allowedExtensions = new Set([".png", ".json", ".html", ".zip", ".txt", ".log"]);

export class ArtifactPathError extends Error {
  constructor(message: string, readonly status: 400 | 404) {
    super(message);
  }
}

export async function resolveArtifactPath(root: string, runId: string, segments: string[]): Promise<string> {
  if (!/^run-[a-zA-Z0-9-]+$/.test(runId)) throw new ArtifactPathError("Invalid run id", 400);
  if (segments.length === 0 || segments.some((segment) => !segment || segment === ".." || segment.includes("/") || segment.includes("\\") || isAbsolute(segment))) {
    throw new ArtifactPathError("Invalid artifact path", 400);
  }
  const extension = extname(segments.at(-1)!).toLowerCase();
  if (!allowedExtensions.has(extension)) throw new ArtifactPathError("Unsupported artifact type", 400);
  try {
    const runRoot = await realpath(join(root, runId));
    const artifact = await realpath(join(runRoot, ...segments));
    if (!artifact.startsWith(`${runRoot}${sep}`)) throw new ArtifactPathError("Artifact not found", 404);
    return artifact;
  } catch (error) {
    if (error instanceof ArtifactPathError) throw error;
    throw new ArtifactPathError("Artifact not found", 404);
  }
}
