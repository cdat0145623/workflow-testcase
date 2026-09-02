import "server-only";

import type pg from "pg";

import { createCatalogRepository } from "@/features/catalog/repository";
import { createDatabasePool } from "@/lib/db/client";
import { createRuntimeValuesRepository } from "../runtime-values/repository";
import { createRuntimeValuesService } from "../runtime-values/service";
import { createRunService, type WorkflowVersionRecord } from "./run-service";
import { createWorkerClient } from "./worker-client";

function runPersistence(pool: pg.Pool) {
  const runtimeValues = createRuntimeValuesRepository(pool);
  return {
    async getVersion(id: string) {
      const result = await pool.query<WorkflowVersionRecord>('SELECT id, test_case_id AS "testCaseId", version_number AS "versionNumber", graph, workflow FROM workflow_versions WHERE id=$1 AND test_case_id IS NOT NULL', [id]);
      return result.rows[0];
    },
    async prepareNewRun({ testCaseId, graph, workflow, storedValues }: { testCaseId: string; graph: WorkflowVersionRecord["graph"]; workflow: WorkflowVersionRecord["workflow"]; storedValues: Parameters<typeof runtimeValues.upsert>[1] }) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [testCaseId]);
        await runtimeValues.upsert(testCaseId, storedValues, client);
        const numberResult = await client.query<{ versionNumber: number }>(
          'SELECT COALESCE(MAX(version_number), 0) + 1 AS "versionNumber" FROM workflow_versions WHERE test_case_id = $1',
          [testCaseId],
        );
        const versionNumber = Number(numberResult.rows[0]!.versionNumber);
        await client.query(
          "INSERT INTO workflow_versions(id, workflow, test_case_id, version_number, graph) VALUES ($1,$2::jsonb,$3,$4,$5::jsonb)",
          [workflow.workflowVersionId, JSON.stringify(workflow), testCaseId, versionNumber, JSON.stringify(graph)],
        );
        await client.query("UPDATE test_cases SET graph=$2::jsonb, updated_at=NOW() WHERE id=$1", [testCaseId, JSON.stringify(graph)]);
        await client.query("COMMIT");
        return { id: workflow.workflowVersionId, testCaseId, versionNumber, graph, workflow };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async prepareVersionReplay({ workflowVersionId, storedValues }: { workflowVersionId: string; storedValues: Parameters<typeof runtimeValues.upsert>[1] }) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query<WorkflowVersionRecord>('SELECT id, test_case_id AS "testCaseId", version_number AS "versionNumber", graph, workflow FROM workflow_versions WHERE id=$1 AND test_case_id IS NOT NULL FOR UPDATE', [workflowVersionId]);
        const version = result.rows[0];
        if (!version) throw new Error("Workflow version not found");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [version.testCaseId]);
        await runtimeValues.upsert(version.testCaseId, storedValues, client);
        await client.query("COMMIT");
        return version;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

export function createConfiguredRunService() {
  const pool = createDatabasePool();
  const catalog = createCatalogRepository(pool);
  const runtimeValues = createRuntimeValuesService({ catalog, runtimeValues: createRuntimeValuesRepository(pool) });
  return {
    service: createRunService({ catalog, runtimeValues, persistence: runPersistence(pool), worker: createWorkerClient() }),
    close: () => pool.end(),
  };
}

export function createConfiguredRuntimeValuesService() {
  const pool = createDatabasePool();
  return {
    service: createRuntimeValuesService({
      catalog: createCatalogRepository(pool),
      runtimeValues: createRuntimeValuesRepository(pool),
    }),
    close: () => pool.end(),
  };
}
