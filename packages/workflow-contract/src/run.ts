import { z } from "zod";

import { workflowSchema, type WorkflowStep } from "./workflow";

export const runStatusSchema = z.enum(["queued", "running", "passed", "failed", "cancelled"]);
export const stepStatusSchema = z.enum(["pending", "running", "passed", "failed", "skipped"]);

export const runRequestSchema = z.object({
  baseUrl: z.string().url(),
  variables: z.record(z.string(), z.string()).default({}),
  workflow: workflowSchema,
});

export type RunStatus = z.infer<typeof runStatusSchema>;
export type StepStatus = z.infer<typeof stepStatusSchema>;
export type RunRequest = z.infer<typeof runRequestSchema>;

export interface StepResult {
  runId: string;
  stepId: string;
  type: WorkflowStep["type"];
  status: StepStatus;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  error?: string;
  output?: Record<string, unknown>;
  artifacts?: string[];
}

export interface RunResult {
  runId: string;
  workflowVersionId: string;
  status: RunStatus;
  browser?: { name: "chromium"; version: string };
  steps: StepResult[];
}
