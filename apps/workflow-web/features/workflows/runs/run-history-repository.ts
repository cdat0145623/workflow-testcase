import type pg from "pg";

import type { RunHistoryEntry } from "./types";

interface RunHistoryRow extends Omit<RunHistoryEntry, "failedStep"> {
  failedStepId?: string | null;
  failedStepTitle?: string | null;
  failedStepError?: string | null;
}

export function createRunHistoryRepository(pool: pg.Pool) {
  return {
    async list(testCaseId: string, requestedLimit = 50): Promise<RunHistoryEntry[]> {
      const limit = Math.max(1, Math.min(50, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 50));
      const result = await pool.query<RunHistoryRow>(
        `SELECT r.id, r.workflow_version_id AS "workflowVersionId", w.version_number AS "versionNumber", r.status,
          r.error, r.created_at AS "createdAt", r.started_at AS "startedAt", r.finished_at AS "finishedAt",
          failed.step_id AS "failedStepId", failed.error AS "failedStepError",
          COALESCE((
            SELECT node->'data'->>'title'
            FROM jsonb_array_elements(w.graph->'nodes') AS node
            WHERE node->>'id' = failed.step_id
            LIMIT 1
          ), failed.step_id) AS "failedStepTitle"
         FROM test_runs r
         INNER JOIN workflow_versions w ON w.id = r.workflow_version_id
         LEFT JOIN LATERAL (
           SELECT sr.step_id, sr.error
           FROM step_runs sr
           WHERE sr.run_id = r.id AND sr.status = 'failed'
           ORDER BY sr.id ASC
           LIMIT 1
         ) failed ON TRUE
         WHERE w.test_case_id = $1
         ORDER BY r.created_at DESC LIMIT $2`,
        [testCaseId, limit],
      );
      return result.rows.map((row) => ({
        id: row.id,
        workflowVersionId: row.workflowVersionId,
        versionNumber: Number(row.versionNumber),
        status: row.status,
        error: row.error ?? undefined,
        createdAt: new Date(row.createdAt).toISOString(),
        startedAt: row.startedAt ? new Date(row.startedAt).toISOString() : undefined,
        finishedAt: row.finishedAt ? new Date(row.finishedAt).toISOString() : undefined,
        failedStep: row.failedStepId && row.failedStepTitle && row.failedStepError
          ? { stepId: row.failedStepId, title: row.failedStepTitle, error: row.failedStepError }
          : undefined,
      }));
    },
  };
}
