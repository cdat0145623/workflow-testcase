import { join } from "node:path";

import type { RunRequest, RunResult, StepResult } from "@cwa-dev/sendkit-workflow-contract";

import { runWorkflow } from "./runner";
import type { TestRunRecord, WorkflowStore } from "./store";

export interface RunService {
  startRun(input: RunRequest): Promise<{ runId: string; status: "queued" }>;
  cancelRun(runId: string): Promise<TestRunRecord | undefined>;
  waitForRun(runId: string): Promise<RunResult | TestRunRecord | undefined>;
}

function redactVariables(variables: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.keys(variables).map((key) => [key, "[REDACTED]"]));
}

export function createRunService({ store, runner = runWorkflow, artifactsRoot = ".local-data/artifacts" }: { store: WorkflowStore; runner?: typeof runWorkflow; artifactsRoot?: string }): RunService {
  const activeRuns = new Map<string, Promise<RunResult | TestRunRecord | undefined>>();
  const cancelledRuns = new Set<string>();
  let queueTail: Promise<void> = Promise.resolve();

  async function processRun(runId: string, input: RunRequest): Promise<RunResult | TestRunRecord | undefined> {
    if (cancelledRuns.has(runId)) return store.getRun(runId);
    await store.updateRun(runId, { status: "running", startedAt: new Date().toISOString() });
    try {
      const result = await runner({
        workflow: { ...input.workflow, runId },
        variables: { ...input.variables, baseUrl: input.baseUrl },
        artifactsDir: join(artifactsRoot, runId),
        shouldCancel: () => cancelledRuns.has(runId),
        onStep: (step: StepResult) => store.recordStep({ ...step, runId }),
      });
      const status = cancelledRuns.has(runId) ? "cancelled" : result.status;
      await store.updateRun(runId, { status, finishedAt: new Date().toISOString(), result: { ...result, status } });
      return { ...result, status };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await store.updateRun(runId, { status: cancelledRuns.has(runId) ? "cancelled" : "failed", finishedAt: new Date().toISOString(), error: message });
      return store.getRun(runId);
    }
  }

  return {
    async startRun(input) {
      await store.saveWorkflowVersion(input.workflow.workflowVersionId, input.workflow);
      const run = await store.createRun({ workflowVersionId: input.workflow.workflowVersionId, baseUrl: input.baseUrl, variables: redactVariables(input.variables) });
      const promise = queueTail.then(() => processRun(run.id, input));
      queueTail = promise.then(() => undefined, () => undefined);
      activeRuns.set(run.id, promise);
      return { runId: run.id, status: "queued" };
    },
    async cancelRun(runId) {
      cancelledRuns.add(runId);
      return store.updateRun(runId, { status: "cancelled", finishedAt: new Date().toISOString() });
    },
    async waitForRun(runId) {
      return activeRuns.get(runId) ?? store.getRun(runId);
    },
  };
}
