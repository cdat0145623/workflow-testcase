import type { Workflow } from "@cwa-dev/sendkit-workflow-contract";

import type { TestCaseRecord } from "@/features/catalog/types";
import { compileGraph } from "../model/compile-graph";
import type { WorkflowGraph } from "../model/types";
import { validateGraph } from "../model/validate-graph";
import type { WorkerClient } from "./worker-client";

export interface WorkflowVersionRecord {
  id: string;
  testCaseId: string;
  versionNumber: number;
  graph: WorkflowGraph;
  workflow: Workflow;
}

export interface RunServicePorts {
  catalog: {
    getTestCase(id: string): Promise<TestCaseRecord | undefined>;
    saveGraph(id: string, graph: WorkflowGraph): Promise<unknown>;
  };
  versions: {
    create(testCaseId: string, graph: WorkflowGraph, workflow: Workflow): Promise<WorkflowVersionRecord>;
    get(id: string): Promise<WorkflowVersionRecord | undefined>;
  };
  worker: WorkerClient;
}

export function createRunService(ports: RunServicePorts) {
  async function createVersion({ testCaseId, graph }: { testCaseId: string; graph: WorkflowGraph }) {
    const problems = validateGraph(graph);
    if (problems.length > 0) throw new Error(`Workflow is invalid: ${problems.map((problem) => problem.message).join(" ")}`);
    const testCase = await ports.catalog.getTestCase(testCaseId);
    if (!testCase) throw new Error("Test case not found");
    const workflowVersionId = `version-${crypto.randomUUID()}`;
    const workflow = compileGraph({ graph, workflowVersionId });
    const version = await ports.versions.create(testCaseId, graph, workflow);
    return { testCase, version };
  }

  return {
    createVersion,
    async startTestCaseRun({ testCaseId, graph, variables }: { testCaseId: string; graph: WorkflowGraph; variables: Record<string, string> }) {
      const { testCase, version } = await createVersion({ testCaseId, graph });
      await ports.catalog.saveGraph(testCaseId, graph);
      const queued = await ports.worker.start({ baseUrl: testCase.baseUrl, variables, workflow: version.workflow });
      return { ...queued, workflowVersionId: version.id };
    },
    async replayRun({ workflowVersionId, variables }: { workflowVersionId: string; variables: Record<string, string> }) {
      const version = await ports.versions.get(workflowVersionId);
      if (!version) throw new Error("Workflow version not found");
      const testCase = await ports.catalog.getTestCase(version.testCaseId);
      if (!testCase) throw new Error("Test case not found");
      const queued = await ports.worker.start({ baseUrl: testCase.baseUrl, variables, workflow: version.workflow });
      return { ...queued, workflowVersionId: version.id };
    },
    getRun: ports.worker.get,
    cancelRun: ports.worker.cancel,
  };
}
