import { compileGraph } from "@/features/workflows/model/compile-graph";
import type { WorkflowGraph } from "@/features/workflows/model/types";
import type { WorkflowVersionRecord } from "@/features/workflows/runs/run-service";
import type pg from "pg";

type ApprovalSessionRow = {
  id: string;
  testCaseId: string;
  status: string;
  sourceStatus: string;
  draftGraph: WorkflowGraph | null;
  diagnostics: Array<{ severity: "blocker" | "warning"; message: string }>;
  approvedWorkflowVersionId: string | null;
  updatedAt: Date;
};

function assertApprovable(session: ApprovalSessionRow, expectedUpdatedAt: string) {
  if (session.status !== "needs_review") throw new Error("Authoring session is not awaiting review");
  if (session.sourceStatus === "pending") throw new Error("Authoring source analysis is incomplete");
  if (Number.isNaN(Date.parse(expectedUpdatedAt)) || Math.abs(session.updatedAt.getTime() - new Date(expectedUpdatedAt).getTime()) >= 1_000) {
    throw new Error("Authoring session changed before approval could be applied");
  }
  if (!session.draftGraph) throw new Error("Authoring session has no compiled draft");
  const blocker = session.diagnostics.find((diagnostic) => diagnostic.severity === "blocker");
  if (blocker) throw new Error(`Authoring draft has a blocker: ${blocker.message}`);
}

export async function approveAuthoringSession({ pool, sessionId, expectedUpdatedAt }: { pool: pg.Pool; sessionId: string; expectedUpdatedAt: string }): Promise<WorkflowVersionRecord> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<ApprovalSessionRow>(
      `SELECT id, test_case_id AS "testCaseId", status, source_status AS "sourceStatus", draft_graph AS "draftGraph", diagnostics,
              approved_workflow_version_id AS "approvedWorkflowVersionId", updated_at AS "updatedAt"
       FROM authoring_sessions WHERE id = $1 FOR UPDATE`,
      [sessionId],
    );
    const session = rows[0];
    if (!session) throw new Error("Authoring session not found");

    if (session.status === "approved" && session.approvedWorkflowVersionId) {
      const existing = await client.query<WorkflowVersionRecord>(
        `SELECT id, test_case_id AS "testCaseId", version_number AS "versionNumber", graph, workflow
         FROM workflow_versions WHERE id = $1`,
        [session.approvedWorkflowVersionId],
      );
      if (!existing.rows[0]) throw new Error("Approved workflow version not found");
      await client.query("COMMIT");
      return existing.rows[0];
    }

    assertApprovable(session, expectedUpdatedAt);
    const graph = session.draftGraph!;
    const versionId = `version-${crypto.randomUUID()}`;
    const workflow = compileGraph({ graph, workflowVersionId: versionId });
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [session.testCaseId]);
    const versionNumberResult = await client.query<{ versionNumber: number }>(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS "versionNumber" FROM workflow_versions WHERE test_case_id = $1`,
      [session.testCaseId],
    );
    const versionNumber = Number(versionNumberResult.rows[0]!.versionNumber);
    await client.query(
      "INSERT INTO workflow_versions(id, workflow, test_case_id, version_number, graph) VALUES ($1, $2::jsonb, $3, $4, $5::jsonb)",
      [versionId, JSON.stringify(workflow), session.testCaseId, versionNumber, JSON.stringify(graph)],
    );
    await client.query("UPDATE test_cases SET graph = $2::jsonb, updated_at = NOW() WHERE id = $1", [session.testCaseId, JSON.stringify(graph)]);
    await client.query(
      `UPDATE authoring_sessions SET status = 'approved', approved_workflow_version_id = $2, updated_at = NOW() WHERE id = $1`,
      [sessionId, versionId],
    );
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [sessionId]);
    await client.query(
      `INSERT INTO authoring_events(session_id, sequence, kind, payload)
       SELECT $1, COALESCE(MAX(sequence), 0) + 1, 'approved', $2::jsonb FROM authoring_events WHERE session_id = $1`,
      [sessionId, JSON.stringify({ workflowVersionId: versionId, versionNumber })],
    );
    await client.query("COMMIT");
    return { id: versionId, testCaseId: session.testCaseId, versionNumber, graph, workflow };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
