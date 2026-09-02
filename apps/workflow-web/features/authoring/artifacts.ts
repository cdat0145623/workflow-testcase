import { mkdir, realpath, writeFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";

import type { AuthoringArtifactReference } from "@cwa-dev/sendkit-workflow-contract";

const sessionIdPattern = /^[a-f0-9-]{36}$/i;
const maxBytes = 5 * 1024 * 1024;

function extensionFor(mimeType: string): "png" | "jpg" {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  throw new Error("Only PNG and JPEG authoring evidence is supported");
}

function matchesMagicBytes(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/png") return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return false;
}

function safeRelativePath(value: string): boolean {
  return value.length > 0 && !value.startsWith("/") && !value.split(/[\\/]+/).some((part) => part === ".." || part.length === 0);
}

export async function storeAuthoringArtifact({ root, sessionId, bytes, mimeType, label }: {
  root: string;
  sessionId: string;
  bytes: Uint8Array;
  mimeType: string;
  label: string;
}): Promise<AuthoringArtifactReference> {
  if (!sessionIdPattern.test(sessionId)) throw new Error("Invalid authoring session ID");
  if (bytes.length === 0 || bytes.length > maxBytes || !matchesMagicBytes(bytes, mimeType)) throw new Error("Authoring evidence bytes do not match the declared image type");
  const extension = extensionFor(mimeType);
  const id = crypto.randomUUID();
  const relativePath = `authoring/${sessionId}/${id}.${extension}`;
  const directory = resolve(root, "authoring", sessionId);
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, basename(relativePath)), bytes, { flag: "wx" });
  return { id, mimeType: mimeType as AuthoringArtifactReference["mimeType"], relativePath, label: label.trim() };
}

export async function resolveAuthoringArtifact(root: string, artifactPath: string): Promise<string> {
  if (!safeRelativePath(artifactPath)) throw new Error("Authoring artifact path is invalid");
  const canonicalRoot = await realpath(root);
  const candidate = await realpath(resolve(canonicalRoot, artifactPath));
  const local = relative(canonicalRoot, candidate);
  if (!safeRelativePath(local)) throw new Error("Authoring artifact path escapes artifact root");
  return candidate;
}
