import { afterAll, beforeAll, expect, test } from "bun:test";
import pg from "pg";

import { createCatalogRepository } from "@/features/catalog/repository";
import { createWorkflowVersionsRepository } from "./repository";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const catalog = createCatalogRepository(pool);
const repository = createWorkflowVersionsRepository(pool);
const suffix = crypto.randomUUID().slice(0, 8);
const projects: string[] = [];
const versionOne = `version-one-${suffix}`;
const versionTwo = `version-two-${suffix}`;
const otherVersion = `other-version-${suffix}`;
const olderRun = `older-run-${suffix}`;
const latestRun = `latest-run-${suffix}`;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for workflow versions repository tests");
});

afterAll(async () => {
  await pool.query("DELETE FROM test_runs WHERE workflow_version_id = ANY($1::text[])", [[versionOne, versionTwo, otherVersion]]);
  await pool.query("DELETE FROM workflow_versions WHERE id = ANY($1::text[])", [[versionOne, versionTwo, otherVersion]]);
  if (projects.length) await pool.query("DELETE FROM projects WHERE id = ANY($1::uuid[])", [projects]);
  await pool.end();
});

async function createTestCase(name: string) {
  const project = await catalog.createProject(`Versions ${name} ${suffix}`);
  projects.push(project.id);
  const feature = await catalog.createFeature(project.id, `Feature ${suffix}`);
  return catalog.createTestCase(feature.id, { name: `Case ${name} ${suffix}`, baseUrl: "http://fixture.test" });
}

const graph = { nodes: [{ id: "start" }], edges: [] };
const workflow = { workflowVersionId: "fixture", steps: [] };

test("lists only one test case's versions with their latest run and loads immutable detail", async () => {
  const testCase = await createTestCase("primary");
  const otherCase = await createTestCase("other");
  await pool.query(
    "INSERT INTO workflow_versions(id, workflow, test_case_id, version_number, graph, created_at) VALUES ($1,$2::jsonb,$3,1,$4::jsonb,'2026-09-02T08:00:00Z'),($5,$6::jsonb,$3,2,$4::jsonb,'2026-09-02T09:00:00Z'),($7,$2::jsonb,$8,1,$4::jsonb,'2026-09-02T10:00:00Z')",
    [versionOne, JSON.stringify(workflow), testCase.id, JSON.stringify(graph), versionTwo, JSON.stringify({ ...workflow, workflowVersionId: versionTwo }), otherVersion, otherCase.id],
  );
  await pool.query(
    "INSERT INTO test_runs(id, workflow_version_id, status, base_url, variables, created_at) VALUES ($1,$2,'failed','http://fixture.test','{}'::jsonb,'2026-09-02T09:01:00Z'),($3,$2,'passed','http://fixture.test','{}'::jsonb,'2026-09-02T09:02:00Z')",
    [olderRun, versionTwo, latestRun],
  );

  expect(await repository.list(testCase.id)).toEqual([
    expect.objectContaining({
      id: versionTwo,
      testCaseId: testCase.id,
      versionNumber: 2,
      stepCount: 1,
      latestRun: { id: latestRun, status: "passed", createdAt: "2026-09-02T09:02:00.000Z" },
    }),
    expect.objectContaining({ id: versionOne, versionNumber: 1, latestRun: undefined }),
  ]);
  expect(await repository.get(versionTwo)).toEqual(expect.objectContaining({ id: versionTwo, graph, workflow: { workflowVersionId: versionTwo, steps: [] } }));
  expect(await repository.get(otherVersion)).toEqual(expect.objectContaining({ testCaseId: otherCase.id }));
});
