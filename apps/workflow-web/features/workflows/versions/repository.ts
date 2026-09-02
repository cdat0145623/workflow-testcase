import type pg from "pg";
import type { WorkflowVersionDetail, WorkflowVersionSummary } from "./types";

export function createWorkflowVersionsRepository(pool: pg.Pool) {
  return {
    async list(testCaseId: string): Promise<WorkflowVersionSummary[]> {
      const result = await pool.query<WorkflowVersionSummary>(
        `SELECT w.id, w.test_case_id AS "testCaseId", w.version_number AS "versionNumber", w.created_at AS "createdAt", jsonb_array_length(w.graph->'nodes') AS "stepCount",
          latest.id AS "latestRunId", latest.status AS "latestRunStatus", latest.created_at AS "latestRunCreatedAt"
         FROM workflow_versions w
         LEFT JOIN LATERAL (
           SELECT id, status, created_at FROM test_runs
           WHERE workflow_version_id = w.id
           ORDER BY created_at DESC LIMIT 1
         ) latest ON true
         WHERE w.test_case_id=$1 ORDER BY w.version_number DESC`,
        [testCaseId],
      );
      return result.rows.map((row) => ({
        id: row.id,
        testCaseId: row.testCaseId,
        versionNumber: Number(row.versionNumber),
        createdAt: new Date(row.createdAt).toISOString(),
        stepCount: Number(row.stepCount),
        latestRun: (row as unknown as { latestRunId?: string; latestRunStatus?: string; latestRunCreatedAt?: string }).latestRunId
          ? {
              id: (row as unknown as { latestRunId: string }).latestRunId,
              status: (row as unknown as { latestRunStatus: string }).latestRunStatus,
              createdAt: new Date((row as unknown as { latestRunCreatedAt: string }).latestRunCreatedAt).toISOString(),
            }
          : undefined,
      }));
    },
    async get(id: string): Promise<WorkflowVersionDetail | undefined> {
      const result = await pool.query<WorkflowVersionDetail>(`SELECT id, test_case_id AS "testCaseId", version_number AS "versionNumber", created_at AS "createdAt", jsonb_array_length(graph->'nodes') AS "stepCount", graph, workflow FROM workflow_versions WHERE id=$1 AND test_case_id IS NOT NULL`, [id]);
      const row = result.rows[0];
      return row ? { ...row, stepCount: Number(row.stepCount), createdAt: new Date(row.createdAt).toISOString() } : undefined;
    },
  };
}
