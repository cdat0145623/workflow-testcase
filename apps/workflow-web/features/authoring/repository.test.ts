import { afterAll, beforeAll, expect, test } from "bun:test";
import pg from "pg";

import { createCatalogRepository } from "@/features/catalog/repository";
import { createAuthoringRepository } from "./repository";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const catalog = createCatalogRepository(pool);
const repository = createAuthoringRepository(pool);
const suffix = crypto.randomUUID().slice(0, 8);
const createdProjectIds: string[] = [];

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for authoring repository tests");
});

afterAll(async () => {
  if (createdProjectIds.length > 0) {
    await pool.query("DELETE FROM projects WHERE id = ANY($1::uuid[])", [createdProjectIds]);
  }
  await pool.end();
});

async function createTestCase(projectName: string) {
  const project = await catalog.createProject(`${projectName} ${suffix}`);
  createdProjectIds.push(project.id);
  const feature = await catalog.createFeature(project.id, `Feature ${suffix}`);
  const testCase = await catalog.createTestCase(feature.id, {
    name: `Test case ${suffix}`,
    baseUrl: "http://host.docker.internal:3001",
  });
  return { project, testCase };
}

test("keeps authoring sessions scoped to their test case and project", async () => {
  const first = await createTestCase("Authoring first");
  const second = await createTestCase("Authoring second");
  const session = await repository.createSession({
    testCaseId: first.testCase.id,
    requirement: "Verify the employee calendar task flow.",
    riskLevel: "write",
  });

  expect((await repository.getSession(session.id))?.testCaseId).toBe(first.testCase.id);
  expect(await repository.listSessions(first.testCase.id)).toHaveLength(1);
  expect(await repository.listSessions(second.testCase.id)).toEqual([]);
});

test("assigns append-only event sequences under one session", async () => {
  const { testCase } = await createTestCase("Authoring events");
  const session = await repository.createSession({
    testCaseId: testCase.id,
    requirement: "Verify login.",
    riskLevel: "read_only",
  });

  await Promise.all([
    repository.appendEvent(session.id, { kind: "source_analysis_completed", payload: { summary: "Login source inspected." } }),
    repository.appendEvent(session.id, { kind: "source_unavailable", payload: { reason: "Second source is optional." } }),
  ]);

  const events = await repository.listEvents(session.id);
  expect(events.map((event) => event.sequence)).toEqual([1, 2]);
  expect(events.map((event) => event.kind).sort()).toEqual(["source_analysis_completed", "source_unavailable"]);
});

test("persists only a workspace key, never an absolute host source path", async () => {
  const { project } = await createTestCase("Source workspace");

  await catalog.setSourceWorkspaceKey(project.id, "hcns");
  expect((await catalog.getProject(project.id))?.sourceWorkspaceKey).toBe("hcns");
  await expect(catalog.setSourceWorkspaceKey(project.id, "/private/source")).rejects.toThrow("workspace key");
});
