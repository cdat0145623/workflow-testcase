import { expect, test } from "bun:test";

import { createWorkflowDataSource } from "./repository";

test("demo mode loads deterministic data without database or worker configuration", async () => {
  const source = createWorkflowDataSource("demo", { databaseUrl: "invalid", workerUrl: "invalid" });
  const projects = await source.listCatalog();
  expect(projects).toHaveLength(2);
  expect(projects.flatMap((project) => project.features).flatMap((feature) => feature.testCases)).toHaveLength(3);
});

test("local mode fails fast when database or worker configuration is missing", () => {
  expect(() => createWorkflowDataSource("local", { databaseUrl: undefined, workerUrl: "http://worker" })).toThrow("DATABASE_URL");
  expect(() => createWorkflowDataSource("local", { databaseUrl: "postgres://db", workerUrl: undefined })).toThrow("WORKFLOW_WORKER_URL");
});
