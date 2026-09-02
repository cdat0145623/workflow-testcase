import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";

import pg from "pg";

import type { RunResult, RunStatus, StepResult, Workflow } from "@cwa-dev/sendkit-workflow-contract";

const { Pool } = pg;

export interface TestRunRecord {
  id: string;
  workflowVersionId: string;
  status: RunStatus;
  baseUrl: string;
  variables: Record<string, string>;
  result?: RunResult;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
}

export interface StepRunRecord extends StepResult {}
export interface CreateRunInput { workflowVersionId: string; baseUrl: string; variables: Record<string, string>; }
export type UpdateRunInput = Partial<Pick<TestRunRecord, "status" | "result" | "error" | "startedAt" | "finishedAt">>;

export interface WorkflowStore {
  migrate(directory: URL): Promise<void>;
  saveWorkflowVersion(id: string, workflow: Workflow): Promise<void>;
  createRun(input: CreateRunInput): Promise<TestRunRecord>;
  updateRun(id: string, patch: UpdateRunInput): Promise<TestRunRecord | undefined>;
  recordStep(step: StepResult): Promise<void>;
  getRun(id: string): Promise<TestRunRecord | undefined>;
  getSteps(runId: string): Promise<StepRunRecord[]>;
  close(): Promise<void>;
}

export function createStore({ connectionString, pool: providedPool }: { connectionString?: string; pool?: pg.Pool } = {}): WorkflowStore {
  const pool = providedPool ?? new Pool({ connectionString });
  return {
    async close() { await pool.end(); },
    async migrate(directory) {
      for (const file of (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort()) {
        await pool.query(await readFile(new URL(file, directory), "utf8"));
      }
    },
    async saveWorkflowVersion(id, workflow) {
      await pool.query("INSERT INTO workflow_versions (id, workflow) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET workflow = EXCLUDED.workflow", [id, JSON.stringify(workflow)]);
    },
    async createRun({ workflowVersionId, baseUrl, variables }) {
      const { rows } = await pool.query<TestRunRecord>("INSERT INTO test_runs (id, workflow_version_id, status, base_url, variables) VALUES ($1, $2, 'queued', $3, $4::jsonb) RETURNING id, workflow_version_id AS \"workflowVersionId\", status, base_url AS \"baseUrl\", variables, created_at AS \"createdAt\"", [`run-${randomUUID()}`, workflowVersionId, baseUrl, JSON.stringify(variables)]);
      return rows[0]!;
    },
    async updateRun(id, patch) {
      const columns: Record<string, string> = { status: "status", startedAt: "started_at", finishedAt: "finished_at", error: "error", result: "result" };
      const entries = Object.entries(patch).filter(([key]) => key in columns);
      if (!entries.length) return this.getRun(id);
      const values = entries.map(([key, value]) => key === "result" ? JSON.stringify(value) : value);
      const fields = entries.map(([key], index) => `${columns[key]} = $${index + 1}`);
      values.push(id);
      const { rows } = await pool.query<TestRunRecord>(`UPDATE test_runs SET ${fields.join(", ")} WHERE id = $${values.length} RETURNING id, workflow_version_id AS "workflowVersionId", status, base_url AS "baseUrl", variables, result, error, started_at AS "startedAt", finished_at AS "finishedAt", created_at AS "createdAt"`, values);
      return rows[0];
    },
    async recordStep(step) {
      await pool.query("INSERT INTO step_runs (run_id, step_id, type, status, started_at, finished_at, duration_ms, error, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) ON CONFLICT (run_id, step_id) DO UPDATE SET type=EXCLUDED.type,status=EXCLUDED.status,started_at=COALESCE(step_runs.started_at, EXCLUDED.started_at),finished_at=EXCLUDED.finished_at,duration_ms=EXCLUDED.duration_ms,error=EXCLUDED.error,metadata=EXCLUDED.metadata", [step.runId, step.stepId, step.type, step.status, step.startedAt ?? null, step.finishedAt ?? null, step.durationMs ?? null, step.error ?? null, JSON.stringify(step.output ?? {})]);
      for (const path of step.artifacts ?? []) await pool.query("INSERT INTO artifacts (run_id, step_id, type, path, mime_type) VALUES ($1,$2,'screenshot',$3,'image/png') ON CONFLICT (run_id,path) DO NOTHING", [step.runId, step.stepId, path]);
    },
    async getRun(id) {
      const { rows } = await pool.query<TestRunRecord>("SELECT id, workflow_version_id AS \"workflowVersionId\", status, base_url AS \"baseUrl\", variables, result, error, started_at AS \"startedAt\", finished_at AS \"finishedAt\", created_at AS \"createdAt\" FROM test_runs WHERE id = $1", [id]);
      return rows[0];
    },
    async getSteps(runId) {
      const { rows } = await pool.query<StepRunRecord>("SELECT run_id AS \"runId\", step_id AS \"stepId\", type, status, started_at AS \"startedAt\", finished_at AS \"finishedAt\", duration_ms AS \"durationMs\", error, metadata AS output FROM step_runs WHERE run_id=$1 ORDER BY id", [runId]);
      return rows;
    },
  };
}
