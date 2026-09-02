import type { Workflow } from "@cwa-dev/sendkit-workflow-contract";

import type { TestCaseRecord } from "@/features/catalog/types";
import { compileGraph } from "../model/compile-graph";
import type { WorkflowGraph } from "../model/types";
import type { RuntimeValuesInput } from "../runtime-values/types";
import type { RuntimeValuesWrite } from "../runtime-values/repository";
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
  };
  runtimeValues: {
    prepareForPersistence(testCaseId: string, values: RuntimeValuesInput, graphOverride?: WorkflowGraph): Promise<{ workerVariables: Record<string, string>; storedValues: RuntimeValuesWrite }>;
  };
  persistence: {
    getVersion(id: string): Promise<WorkflowVersionRecord | undefined>;
    prepareNewRun(input: { testCaseId: string; graph: WorkflowGraph; workflow: Workflow; storedValues: RuntimeValuesWrite }): Promise<WorkflowVersionRecord>;
    prepareVersionReplay(input: { workflowVersionId: string; storedValues: RuntimeValuesWrite }): Promise<WorkflowVersionRecord>;
  };
  worker: WorkerClient;
}

export function createRunService(ports: RunServicePorts) {
  async function prepareNewRun({ testCaseId, graph, variables }: { testCaseId: string; graph: WorkflowGraph; variables: RuntimeValuesInput }) {
    const problems = validateGraph(graph);
    if (problems.length > 0) throw new Error(`Workflow is invalid: ${problems.map((problem) => problem.message).join(" ")}`);
    const testCase = await ports.catalog.getTestCase(testCaseId);
    if (!testCase) throw new Error("Test case not found");
    const workflowVersionId = `version-${crypto.randomUUID()}`;
    const workflow = compileGraph({ graph, workflowVersionId });
    const prepared = await ports.runtimeValues.prepareForPersistence(testCaseId, variables, graph);
    const version = await ports.persistence.prepareNewRun({ testCaseId, graph, workflow, storedValues: prepared.storedValues });
    return { testCase, version, workerVariables: prepared.workerVariables };
  }

  return {
    async startTestCaseRun({ testCaseId, graph, variables }: { testCaseId: string; graph: WorkflowGraph; variables: Record<string, string> }) {
      const { testCase, version, workerVariables } = await prepareNewRun({ testCaseId, graph, variables });
      const queued = await ports.worker.start({ baseUrl: testCase.baseUrl, variables: workerVariables, workflow: version.workflow });
      return { ...queued, workflowVersionId: version.id };
    },
    async replayRun({ workflowVersionId, variables }: { workflowVersionId: string; variables: Record<string, string> }) {
      const existing = await ports.persistence.getVersion(workflowVersionId);
      if (!existing) throw new Error("Workflow version not found");
      const prepared = await ports.runtimeValues.prepareForPersistence(existing.testCaseId, variables, existing.graph);
      const version = await ports.persistence.prepareVersionReplay({ workflowVersionId, storedValues: prepared.storedValues });
      const testCase = await ports.catalog.getTestCase(version.testCaseId);
      if (!testCase) throw new Error("Test case not found");
      const queued = await ports.worker.start({ baseUrl: testCase.baseUrl, variables: prepared.workerVariables, workflow: version.workflow });
      return { ...queued, workflowVersionId: version.id };
    },
    getRun: ports.worker.get,
    cancelRun: ports.worker.cancel,
  };
}
