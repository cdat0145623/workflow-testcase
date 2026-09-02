import { afterAll, beforeAll, expect, test } from "bun:test";
import pg from "pg";

import { createCatalogRepository } from "./repository";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const repository = createCatalogRepository(pool);
const suffix = crypto.randomUUID().slice(0, 8);
const createdProjectIds: string[] = [];

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for catalog repository tests");
});

afterAll(async () => {
  if (createdProjectIds.length > 0) {
    await pool.query("DELETE FROM projects WHERE id = ANY($1::uuid[])", [createdProjectIds]);
  }
  await pool.end();
});

test("keeps features and test cases isolated by project", async () => {
  const projectA = await repository.createProject(`Project A ${suffix}`);
  const projectB = await repository.createProject(`Project B ${suffix}`);
  createdProjectIds.push(projectA.id, projectB.id);

  const featureA = await repository.createFeature(projectA.id, `Login ${suffix}`);
  const featureB = await repository.createFeature(projectB.id, `Login ${suffix}`);
  const testCaseA = await repository.createTestCase(featureA.id, {
    name: `Successful login ${suffix}`,
    baseUrl: "http://host.docker.internal:3001",
  });
  const testCaseB = await repository.createTestCase(featureB.id, {
    name: `Successful login ${suffix}`,
    baseUrl: "http://host.docker.internal:3002",
  });

  expect(await repository.listFeatures(projectA.id)).toEqual([featureA]);
  expect(await repository.listFeatures(projectB.id)).toEqual([featureB]);
  expect(await repository.listTestCases(featureA.id)).toEqual([testCaseA]);
  expect(await repository.listTestCases(featureB.id)).toEqual([testCaseB]);
  expect((await repository.getTestCase(testCaseA.id))?.featureId).toBe(featureA.id);
  expect((await repository.getTestCase(testCaseB.id))?.featureId).toBe(featureB.id);
  expect(testCaseA.graph.nodes.map((node) => node.data.type)).toEqual(["start", "open-url"]);
  expect(testCaseA.graph.edges).toEqual([]);
});

test("creates stable unique slugs within the same parent", async () => {
  const project = await repository.createProject(`Slug Project ${suffix}`);
  createdProjectIds.push(project.id);

  const first = await repository.createFeature(project.id, "Login flow");
  const second = await repository.createFeature(project.id, "Login flow");

  expect(first.slug).toBe("login-flow");
  expect(second.slug).toBe("login-flow-2");
});
