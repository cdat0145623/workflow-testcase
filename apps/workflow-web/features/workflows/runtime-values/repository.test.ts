import { afterAll, beforeAll, expect, test } from "bun:test";
import pg from "pg";

import { createCatalogRepository } from "@/features/catalog/repository";
import { createRuntimeValuesRepository } from "./repository";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const catalog = createCatalogRepository(pool);
const repository = createRuntimeValuesRepository(pool);
const suffix = crypto.randomUUID().slice(0, 8);
const createdProjectIds: string[] = [];

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for runtime-values repository tests");
});

afterAll(async () => {
  if (createdProjectIds.length > 0) await pool.query("DELETE FROM projects WHERE id = ANY($1::uuid[])", [createdProjectIds]);
  await pool.end();
});

async function createTestCase() {
  const project = await catalog.createProject(`Runtime values ${suffix}`);
  createdProjectIds.push(project.id);
  const feature = await catalog.createFeature(project.id, `Feature ${suffix}`);
  return catalog.createTestCase(feature.id, { name: `Login ${suffix}`, baseUrl: "http://fixture.test" });
}

test("overwrites the one preset for a test case without storing its plaintext password", async () => {
  const testCase = await createTestCase();
  await repository.upsert(testCase.id, {
    username: "operator",
    passwordCiphertext: "v1.initial-ciphertext",
    taskTitle: "First task",
    assigneeName: "Taylor",
  });
  await repository.upsert(testCase.id, {
    username: "operator-two",
    passwordCiphertext: "v1.replaced-ciphertext",
    taskTitle: "Second task",
    assigneeName: "Morgan",
  });

  expect(await repository.get(testCase.id)).toMatchObject({
    testCaseId: testCase.id,
    username: "operator-two",
    passwordCiphertext: "v1.replaced-ciphertext",
    taskTitle: "Second task",
    assigneeName: "Morgan",
  });
  const stored = await pool.query("SELECT * FROM test_case_runtime_values WHERE test_case_id = $1", [testCase.id]);
  expect(stored.rows).toHaveLength(1);
  expect(JSON.stringify(stored.rows[0])).not.toContain("internal-password");
});
