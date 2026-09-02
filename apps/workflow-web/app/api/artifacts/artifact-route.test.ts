import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveArtifactPath } from "./resolve-artifact";
import { GET } from "./[runId]/[...path]/route";

let root = "";
const runId = "run-11111111-1111-4111-8111-111111111111";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "sendkit-artifacts-"));
  await mkdir(join(root, runId, "steps"), { recursive: true });
  await writeFile(join(root, runId, "steps", "before.png"), "png");
  await writeFile(join(root, "outside.txt"), "secret");
  await symlink(join(root, "outside.txt"), join(root, runId, "steps", "escape.txt"));
});

afterAll(async () => rm(root, { recursive: true, force: true }));

test("resolves an allowed file below its run", async () => {
  expect(await resolveArtifactPath(root, runId, ["steps", "before.png"])).toBe(join(root, runId, "steps", "before.png"));
});

test("rejects traversal, unknown runs and symlink escapes", async () => {
  await expect(resolveArtifactPath(root, runId, ["..", "outside.txt"])).rejects.toThrow();
  await expect(resolveArtifactPath(root, "run-22222222-2222-4222-8222-222222222222", ["report.json"])).rejects.toThrow();
  await expect(resolveArtifactPath(root, runId, ["steps", "escape.txt"])).rejects.toThrow();
});

test("serves only the repository-owned demo screenshots for demo runs", async () => {
  const previousMode = process.env.WORKFLOW_DATA_MODE;
  process.env.WORKFLOW_DATA_MODE = "demo";
  try {
    const response = await GET(new Request("http://workflow-web/api/artifacts/demo-fail-1/steps/verify-before.png"), {
      params: Promise.resolve({ runId: "demo-fail-1", path: ["steps", "verify-before.png"] }),
    });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://workflow-web/demo-artifacts/failed-before.png");

    const forbidden = await GET(new Request("http://workflow-web/api/artifacts/demo-fail-1/package.json"), {
      params: Promise.resolve({ runId: "demo-fail-1", path: ["package.json"] }),
    });
    expect([400, 404]).toContain(forbidden.status);
  } finally {
    if (previousMode === undefined) delete process.env.WORKFLOW_DATA_MODE;
    else process.env.WORKFLOW_DATA_MODE = previousMode;
  }
});
