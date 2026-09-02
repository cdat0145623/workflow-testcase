import { afterAll, expect, test } from "bun:test";
import pg from "pg";
import { createCatalogRepository } from "@/features/catalog/repository";
import { approveAuthoringSession } from "./approval-service";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const catalog = createCatalogRepository(pool);
const projects: string[] = [];
afterAll(async () => { if (projects.length) await pool.query("DELETE FROM projects WHERE id = ANY($1::uuid[])", [projects]); await pool.end(); });

test("PostgreSQL approval is atomic and idempotent without enqueuing a run", async () => {
  const project = await catalog.createProject(`Approval ${crypto.randomUUID()}`); projects.push(project.id);
  const feature = await catalog.createFeature(project.id, "Schedule");
  const testCase = await catalog.createTestCase(feature.id, { name: "Daily task", baseUrl: "http://example.test" });
  const graph = { nodes: [{ id: "start", type: "step", position: { x: 0, y: 0 }, data: { type: "start", kind: "trigger", title: "Start", values: {} } }, { id: "open", type: "step", position: { x: 300, y: 0 }, data: { type: "open-url", kind: "action", title: "Open", values: { url: "{{baseUrl}}" } } }], edges: [{ id: "start-open", source: "start", target: "open" }] };
  const session = (await pool.query(`INSERT INTO authoring_sessions(test_case_id, requirement, status, risk_level, source_status, draft_graph, diagnostics) VALUES ($1,$2,'needs_review','read_only','complete',$3::jsonb,'[]'::jsonb) RETURNING id, updated_at`, [testCase.id, "Verify", JSON.stringify(graph)])).rows[0]!;
  const first = await approveAuthoringSession({ pool, sessionId: session.id, expectedUpdatedAt: new Date(session.updated_at).toISOString() });
  const second = await approveAuthoringSession({ pool, sessionId: session.id, expectedUpdatedAt: new Date(session.updated_at).toISOString() });
  expect(second.id).toBe(first.id);
  expect((await pool.query("SELECT count(*)::int AS count FROM workflow_versions WHERE test_case_id=$1", [testCase.id])).rows[0]?.count).toBe(1);
  expect((await pool.query("SELECT count(*)::int AS count FROM test_runs WHERE workflow_version_id=$1", [first.id])).rows[0]?.count).toBe(0);
});
