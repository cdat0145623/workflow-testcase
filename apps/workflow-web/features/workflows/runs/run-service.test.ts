import { describe, expect, test } from "bun:test";

import type { Workflow } from "@cwa-dev/sendkit-workflow-contract";
import type { TestCaseRecord } from "@/features/catalog/types";
import type { WorkflowGraph } from "../model/types";
import { createRunService, type RunServicePorts, type WorkflowVersionRecord } from "./run-service";

const graph: WorkflowGraph = {
  nodes: [
    { id: "start", type: "step", position: { x: 0, y: 0 }, data: { type: "start", kind: "trigger", title: "Start", values: {} } },
    { id: "open", type: "step", position: { x: 300, y: 0 }, data: { type: "open-url", kind: "action", title: "Open", values: { url: "{{baseUrl}}/login" } } },
  ],
  edges: [{ id: "start-open", source: "start", target: "open" }],
};

function fixture() {
  const testCase: TestCaseRecord = { id: "case-1", featureId: "feature-1", name: "Login", slug: "login", baseUrl: "https://app.test", graph };
  const versions: WorkflowVersionRecord[] = [];
  const workerInputs: Array<{ baseUrl: string; variables: Record<string, string>; workflow: Workflow }> = [];
  const ports: RunServicePorts = {
    catalog: {
      async getTestCase(id) { return id === testCase.id ? testCase : undefined; },
      async saveGraph(_id, nextGraph) { testCase.graph = nextGraph; },
    },
    versions: {
      async create(testCaseId, nextGraph, workflow) {
        const record = { id: workflow.workflowVersionId, testCaseId, versionNumber: versions.length + 1, graph: nextGraph, workflow };
        versions.push(record);
        return record;
      },
      async get(id) { return versions.find((version) => version.id === id); },
    },
    worker: {
      async start(input) { workerInputs.push(input); return { runId: "run-1", status: "queued" }; },
      async get() { throw new Error("unused"); },
      async cancel() { throw new Error("unused"); },
    },
  };
  return { service: createRunService(ports), versions, workerInputs };
}

describe("run service", () => {
  test("saves graph, creates an immutable incremented version and queues exact compiled workflow", async () => {
    const { service, versions, workerInputs } = fixture();
    const result = await service.startTestCaseRun({ testCaseId: "case-1", graph, variables: { email: "person@example.com" } });

    expect(result).toEqual({ runId: "run-1", status: "queued", workflowVersionId: versions[0]?.id });
    expect(versions[0]?.versionNumber).toBe(1);
    expect(workerInputs[0]).toEqual({
      baseUrl: "https://app.test",
      variables: { email: "person@example.com" },
      workflow: versions[0]?.workflow,
    });
  });

  test("does not create a version for an invalid graph", async () => {
    const { service, versions } = fixture();
    await expect(service.startTestCaseRun({ testCaseId: "case-1", graph: { nodes: graph.nodes, edges: [] }, variables: {} })).rejects.toThrow("invalid");
    expect(versions).toHaveLength(0);
  });

  test("replays the stored workflow unchanged", async () => {
    const { service, versions, workerInputs } = fixture();
    await service.startTestCaseRun({ testCaseId: "case-1", graph, variables: {} });
    const stored = structuredClone(versions[0]!.workflow);
    await service.replayRun({ workflowVersionId: versions[0]!.id, variables: { attempt: "2" } });
    expect(workerInputs[1]?.workflow).toEqual(stored);
  });
});
