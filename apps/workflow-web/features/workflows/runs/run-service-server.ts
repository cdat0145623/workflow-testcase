import "server-only";

import type pg from "pg";

import { createCatalogRepository } from "@/features/catalog/repository";
import { createDatabasePool } from "@/lib/db/client";
import { createRunService, type WorkflowVersionRecord } from "./run-service";
import { createWorkerClient } from "./worker-client";

function versionPorts(pool: pg.Pool) {
  return {
    async create(testCaseId: string, graph: WorkflowVersionRecord["graph"], workflow: WorkflowVersionRecord["workflow"]) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [testCaseId]);
        const numberResult = await client.query<{ versionNumber: number }>(
          'SELECT COALESCE(MAX(version_number), 0) + 1 AS "versionNumber" FROM workflow_versions WHERE test_case_id = $1',
          [testCaseId],
        );
        const versionNumber = Number(numberResult.rows[0]!.versionNumber);
        await client.query(
          "INSERT INTO workflow_versions(id, workflow, test_case_id, version_number, graph) VALUES ($1,$2::jsonb,$3,$4,$5::jsonb)",
          [workflow.workflowVersionId, JSON.stringify(workflow), testCaseId, versionNumber, JSON.stringify(graph)],
        );
        await client.query("COMMIT");
        return { id: workflow.workflowVersionId, testCaseId, versionNumber, graph, workflow };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async get(id: string) {
      const result = await pool.query<{
        id: string;
        testCaseId: string;
        versionNumber: number;
        graph: WorkflowVersionRecord["graph"];
        workflow: WorkflowVersionRecord["workflow"];
      }>(
        'SELECT id, test_case_id AS "testCaseId", version_number AS "versionNumber", graph, workflow FROM workflow_versions WHERE id=$1 AND test_case_id IS NOT NULL',
        [id],
      );
      return result.rows[0];
    },
  };
}

export function createConfiguredRunService() {
  const pool = createDatabasePool();
  const catalog = createCatalogRepository(pool);
  return {
    service: createRunService({ catalog, versions: versionPorts(pool), worker: createWorkerClient() }),
    close: () => pool.end(),
  };
}
