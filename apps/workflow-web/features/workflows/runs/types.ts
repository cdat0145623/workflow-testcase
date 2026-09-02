import type { RunStatus, StepResult, Workflow } from "@cwa-dev/sendkit-workflow-contract";

export interface QueuedRun {
  runId: string;
  status: "queued";
}

export interface WorkerRun {
  id: string;
  workflowVersionId: string;
  status: RunStatus;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  steps: StepResult[];
}

export interface StartWorkerRunInput {
  baseUrl: string;
  variables: Record<string, string>;
  workflow: Workflow;
}
