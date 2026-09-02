import { expect, test } from "bun:test";

import type { TestCaseRecord } from "@/features/catalog/types";
import type { WorkflowGraph } from "../model/types";
import { encryptRuntimePassword } from "./crypto";
import type { RuntimeValuesRepository } from "./repository";
import { RuntimeValuesValidationError } from "./field-registry";
import { createRuntimeValuesService } from "./service";

const key = Buffer.alloc(32, 3).toString("base64");
const graph: WorkflowGraph = {
  nodes: [
    { id: "start", type: "step", position: { x: 0, y: 0 }, data: { type: "start", kind: "trigger", title: "Start", values: {} } },
    { id: "login", type: "step", position: { x: 200, y: 0 }, data: { type: "fill", kind: "action", title: "Login", values: { username: "{{username}}", password: "{{secret.login_password}}", title: "{{taskTitle}}" } } },
  ],
  edges: [{ id: "start-login", source: "start", target: "login" }],
};

const testCase: TestCaseRecord = { id: "case-1", featureId: "feature-1", name: "Login", slug: "login", baseUrl: "http://fixture.test", graph };

function runtimeRepository(): RuntimeValuesRepository {
  let stored = {
    testCaseId: "case-1",
    username: "saved-user",
    passwordCiphertext: encryptRuntimePassword("saved-password", key),
    taskTitle: "Saved task",
    assigneeName: "Saved assignee",
    updatedAt: new Date().toISOString(),
  };
  return {
    async get() { return stored; },
    async upsert(testCaseId, values) {
      stored = { ...stored, testCaseId, ...values, updatedAt: new Date().toISOString() };
      return stored;
    },
  };
}

test("prefills only fields referenced by the graph and decrypts its password server-side", async () => {
  const service = createRuntimeValuesService({
    catalog: { async getTestCase() { return testCase; } },
    runtimeValues: runtimeRepository(),
    secretKey: key,
  });

  await expect(service.getForGraph("case-1")).resolves.toEqual({
    fields: [
      { key: "username", label: "Username", sensitive: false, persistedKey: "username", required: true },
      { key: "secret.login_password", label: "Password", sensitive: true, persistedKey: "password", required: true },
      { key: "taskTitle", label: "Task title", sensitive: false, persistedKey: "taskTitle", required: true },
    ],
    values: { username: "saved-user", "secret.login_password": "saved-password", taskTitle: "Saved task" },
  });
});

test("rejects missing graph-required values before encrypting or persisting", async () => {
  const service = createRuntimeValuesService({
    catalog: { async getTestCase() { return testCase; } },
    runtimeValues: runtimeRepository(),
    secretKey: key,
  });

  await expect(service.prepareForPersistence("case-1", { username: "operator", "secret.login_password": "secret", taskTitle: "" })).rejects.toBeInstanceOf(RuntimeValuesValidationError);
});

test("preserves unreferenced preset values while encrypting a submitted password", async () => {
  const service = createRuntimeValuesService({
    catalog: { async getTestCase() { return testCase; } },
    runtimeValues: runtimeRepository(),
    secretKey: key,
  });

  const result = await service.prepareForPersistence("case-1", {
    username: "operator",
    "secret.login_password": "new-password",
    taskTitle: "  Updated task ",
  });

  expect(result.workerVariables).toEqual({ username: "operator", "secret.login_password": "new-password", taskTitle: "Updated task" });
  expect(result.storedValues).toMatchObject({ username: "operator", taskTitle: "Updated task", assigneeName: "Saved assignee" });
  expect(result.storedValues.passwordCiphertext).not.toContain("new-password");
});

test("uses an immutable version graph instead of the current draft when preparing a replay", async () => {
  const service = createRuntimeValuesService({
    catalog: { async getTestCase() { return testCase; } },
    runtimeValues: runtimeRepository(),
    secretKey: key,
  });
  const versionGraph: WorkflowGraph = { ...graph, nodes: graph.nodes.map((node) => node.id === "login" ? { ...node, data: { ...node.data, values: { title: "{{assigneeName}}" } } } : node) };

  await expect(service.prepareForPersistence("case-1", { assigneeName: "Morgan" }, versionGraph)).resolves.toMatchObject({
    workerVariables: { assigneeName: "Morgan" },
    storedValues: { assigneeName: "Morgan" },
  });
  await expect(service.getForGraph("case-1", versionGraph)).resolves.toMatchObject({
    values: { assigneeName: "Saved assignee" },
  });
});
