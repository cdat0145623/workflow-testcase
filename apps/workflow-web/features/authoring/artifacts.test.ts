import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveAuthoringArtifact, storeAuthoringArtifact } from "./artifacts";

let root = "";

beforeAll(async () => { root = await mkdtemp(join(tmpdir(), "sendkit-authoring-artifacts-")); });
afterAll(async () => { await rm(root, { recursive: true, force: true }); });

test("stores a PNG using a generated path without retaining a local filename", async () => {
  const artifact = await storeAuthoringArtifact({
    root,
    sessionId: "11111111-1111-4111-8111-111111111111",
    bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    mimeType: "image/png",
    label: "Before save",
  });

  expect(artifact).toMatchObject({ mimeType: "image/png", label: "Before save" });
  expect(artifact.relativePath).toMatch(/^authoring\/11111111-1111-4111-8111-111111111111\/[a-f0-9-]+\.png$/);
  await expect(resolveAuthoringArtifact(root, artifact.relativePath)).resolves.toContain("authoring");
});

test("rejects unsupported or mismatched image bytes and traversal", async () => {
  await expect(storeAuthoringArtifact({ root, sessionId: "11111111-1111-4111-8111-111111111111", bytes: new Uint8Array([60, 115, 118, 103]), mimeType: "image/svg+xml", label: "Bad" })).rejects.toThrow();
  await expect(storeAuthoringArtifact({ root, sessionId: "11111111-1111-4111-8111-111111111111", bytes: new Uint8Array([137, 80, 78, 71]), mimeType: "image/jpeg", label: "Bad" })).rejects.toThrow();
  await expect(resolveAuthoringArtifact(root, "authoring/../outside.png")).rejects.toThrow();
});
