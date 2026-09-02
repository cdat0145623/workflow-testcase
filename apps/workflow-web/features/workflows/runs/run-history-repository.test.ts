import { afterAll, beforeAll, expect, test } from "bun:test";
import pg from "pg";

import { createCatalogRepository } from "@/features/catalog/repository";
import { createRunHistoryRepository } from "./run-history-repository";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const catalog = createCatalogRepository(pool);
const repository = createRunHistoryRepository(pool);
const suffix = crypto.randomUUID().slice(0, 8);
const versions = [`history-v1-${suffix}`, `history-v2-${suffix}`, `history-other-${suffix}`];
const runs = [`history-run-1-${suffix}`, `history-run-2-${suffix}`, `history-run-other-${suffix}`];
const projects: string[] = [];

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for run history repository tests");
});

afterAll(async () => {
  await pool.query("DELETE FROM test_runs WHERE id = ANY($1::text[])", [runs]);
  await pool.query("DELETE FROM workflow_versions WHERE id = ANY($1::text[])", [versions]);
  if (projects.length) await pool.query("DELETE FROM projects WHERE id = ANY($1::uuid[])", [projects]);
  await pool.end();
});

async function createTestCase(name: string) {
  const project = await catalog.createProject(`Run history ${name} ${suffix}`);
  projects.push(project.id);
  const feature = await catalog.createFeature(project.id, `Feature ${suffix}`);
  return catalog.createTestCase(feature.id, { name, baseUrl: "http://fixture.test" });
}

test("returns persisted runs scoped to the selected test case in newest-first order", async () => {
  const testCase = await createTestCase(`Primary ${suffix}`);
  const otherCase = await createTestCase(`Other ${suffix}`);
  const graph = JSON.stringify({ nodes: [{ id: "verify", data: { title: "Verify daily task" } }], edges: [] });
  const workflow = JSON.stringify({ workflowVersionId: "fixture", steps: [] });
  await pool.query(
    "INSERT INTO workflow_versions(id, workflow, test_case_id, version_number, graph) VALUES ($1,$2::jsonb,$3,1,$4::jsonb),($5,$2::jsonb,$3,2,$4::jsonb),($6,$2::jsonb,$7,1,$4::jsonb)",
    [versions[0], workflow, testCase.id, graph, versions[1], versions[2], otherCase.id],
  );
  await pool.query(
    "INSERT INTO test_runs(id, workflow_version_id, status, base_url, variables, error, created_at) VALUES ($1,$2,'failed','http://fixture.test','{}'::jsonb,'bad selector','2026-09-02T11:00:00Z'),($3,$4,'passed','http://fixture.test','{}'::jsonb,NULL,'2026-09-02T12:00:00Z'),($5,$6,'passed','http://fixture.test','{}'::jsonb,NULL,'2026-09-02T13:00:00Z')",
    [runs[0], versions[0], runs[1], versions[1], runs[2], versions[2]],
  );
  await pool.query(
    "INSERT INTO step_runs(run_id, step_id, type, status, error) VALUES ($1,'verify','expect-visible','failed','daily task was not visible')",
    [runs[0]],
  );

  expect(await repository.list(testCase.id)).toEqual([
    expect.objectContaining({ id: runs[1], workflowVersionId: versions[1], status: "passed", versionNumber: 2 }),
    expect.objectContaining({
      id: runs[0],
      workflowVersionId: versions[0],
      status: "failed",
      error: "bad selector",
      versionNumber: 1,
      failedStep: { stepId: "verify", title: "Verify daily task", error: "daily task was not visible" },
    }),
  ]);
});
