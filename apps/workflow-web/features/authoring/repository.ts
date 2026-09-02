import type {
  AuthoringDiagnostic,
  AuthoringEventInput,
  AuthoringRiskLevel,
  AuthoringSessionStatus,
  AuthoringSourceStatus,
} from "@cwa-dev/sendkit-workflow-contract";
import type pg from "pg";

import type { WorkflowGraph } from "@/features/workflows/model/types";

export interface AuthoringSessionRecord {
  id: string;
  testCaseId: string;
  requirement: string;
  status: AuthoringSessionStatus;
  riskLevel: AuthoringRiskLevel;
  sourceStatus: AuthoringSourceStatus;
  draftGraph?: WorkflowGraph;
  diagnostics: AuthoringDiagnostic[];
  approvedWorkflowVersionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthoringEventRecord {
  id: string;
  sessionId: string;
  sequence: number;
  kind: AuthoringEventInput["kind"];
  payload: AuthoringEventInput["payload"];
  createdAt: string;
}

export interface AuthoringRepository {
  createSession(input: { testCaseId: string; requirement: string; riskLevel: AuthoringRiskLevel }): Promise<AuthoringSessionRecord>;
  getSession(id: string): Promise<AuthoringSessionRecord | undefined>;
  listSessions(testCaseId: string): Promise<AuthoringSessionRecord[]>;
  appendEvent(sessionId: string, event: AuthoringEventInput): Promise<AuthoringEventRecord>;
  listEvents(sessionId: string): Promise<AuthoringEventRecord[]>;
  transition(id: string, from: AuthoringSessionStatus, to: AuthoringSessionStatus): Promise<AuthoringSessionRecord | undefined>;
  updateSourceStatus(id: string, sourceStatus: AuthoringSourceStatus): Promise<AuthoringSessionRecord | undefined>;
  saveCompiledDraft(id: string, graph: WorkflowGraph, diagnostics: AuthoringDiagnostic[]): Promise<AuthoringSessionRecord | undefined>;
}

const allowedTransitions: Record<AuthoringSessionStatus, readonly AuthoringSessionStatus[]> = {
  drafting: ["source_review", "cancelled"],
  source_review: ["browser_discovery", "failed", "cancelled"],
  browser_discovery: ["needs_review", "failed", "cancelled"],
  needs_review: ["browser_discovery", "rejected", "approved"],
  approved: [],
  rejected: [],
  failed: [],
  cancelled: [],
};

function sessionRecord(row: Record<string, unknown>): AuthoringSessionRecord {
  return {
    id: String(row.id),
    testCaseId: String(row.testCaseId),
    requirement: String(row.requirement),
    status: row.status as AuthoringSessionStatus,
    riskLevel: row.riskLevel as AuthoringRiskLevel,
    sourceStatus: row.sourceStatus as AuthoringSourceStatus,
    ...(row.draftGraph ? { draftGraph: row.draftGraph as WorkflowGraph } : {}),
    diagnostics: (row.diagnostics ?? []) as AuthoringDiagnostic[],
    ...(row.approvedWorkflowVersionId ? { approvedWorkflowVersionId: String(row.approvedWorkflowVersionId) } : {}),
    createdAt: new Date(String(row.createdAt)).toISOString(),
    updatedAt: new Date(String(row.updatedAt)).toISOString(),
  };
}

function eventRecord(row: Record<string, unknown>): AuthoringEventRecord {
  return {
    id: String(row.id),
    sessionId: String(row.sessionId),
    sequence: Number(row.sequence),
    kind: row.kind as AuthoringEventInput["kind"],
    payload: row.payload as AuthoringEventInput["payload"],
    createdAt: new Date(String(row.createdAt)).toISOString(),
  };
}

export function createAuthoringRepository(pool: pg.Pool): AuthoringRepository {
  return {
    async createSession({ testCaseId, requirement, riskLevel }) {
      const { rows } = await pool.query<Record<string, unknown>>(
        `INSERT INTO authoring_sessions (test_case_id, requirement, status, risk_level, source_status)
         VALUES ($1, $2, 'drafting', $3, 'pending')
         RETURNING id, test_case_id AS "testCaseId", requirement, status, risk_level AS "riskLevel", source_status AS "sourceStatus", draft_graph AS "draftGraph", diagnostics, approved_workflow_version_id AS "approvedWorkflowVersionId", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [testCaseId, requirement.trim(), riskLevel],
      );
      return sessionRecord(rows[0]!);
    },
    async getSession(id) {
      const { rows } = await pool.query<Record<string, unknown>>(
        `SELECT id, test_case_id AS "testCaseId", requirement, status, risk_level AS "riskLevel", source_status AS "sourceStatus", draft_graph AS "draftGraph", diagnostics, approved_workflow_version_id AS "approvedWorkflowVersionId", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM authoring_sessions WHERE id = $1`,
        [id],
      );
      return rows[0] ? sessionRecord(rows[0]) : undefined;
    },
    async listSessions(testCaseId) {
      const { rows } = await pool.query<Record<string, unknown>>(
        `SELECT id, test_case_id AS "testCaseId", requirement, status, risk_level AS "riskLevel", source_status AS "sourceStatus", draft_graph AS "draftGraph", diagnostics, approved_workflow_version_id AS "approvedWorkflowVersionId", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM authoring_sessions WHERE test_case_id = $1 ORDER BY created_at DESC`,
        [testCaseId],
      );
      return rows.map(sessionRecord);
    },
    async appendEvent(sessionId, event) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [sessionId]);
        const { rows } = await client.query<Record<string, unknown>>(
          `INSERT INTO authoring_events (session_id, sequence, kind, payload)
           SELECT $1, COALESCE(MAX(sequence), 0) + 1, $2, $3::jsonb
           FROM authoring_events WHERE session_id = $1
           RETURNING id, session_id AS "sessionId", sequence, kind, payload, created_at AS "createdAt"`,
          [sessionId, event.kind, JSON.stringify(event.payload)],
        );
        await client.query("UPDATE authoring_sessions SET updated_at = NOW() WHERE id = $1", [sessionId]);
        await client.query("COMMIT");
        return eventRecord(rows[0]!);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async listEvents(sessionId) {
      const { rows } = await pool.query<Record<string, unknown>>(
        `SELECT id, session_id AS "sessionId", sequence, kind, payload, created_at AS "createdAt"
         FROM authoring_events WHERE session_id = $1 ORDER BY sequence`,
        [sessionId],
      );
      return rows.map(eventRecord);
    },
    async transition(id, from, to) {
      if (!allowedTransitions[from].includes(to)) throw new Error(`Illegal authoring transition: ${from} -> ${to}`);
      const { rows } = await pool.query<Record<string, unknown>>(
        `UPDATE authoring_sessions SET status = $3, updated_at = NOW()
         WHERE id = $1 AND status = $2
         RETURNING id, test_case_id AS "testCaseId", requirement, status, risk_level AS "riskLevel", source_status AS "sourceStatus", draft_graph AS "draftGraph", diagnostics, approved_workflow_version_id AS "approvedWorkflowVersionId", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [id, from, to],
      );
      return rows[0] ? sessionRecord(rows[0]) : undefined;
    },
    async updateSourceStatus(id, sourceStatus) {
      const { rows } = await pool.query<Record<string, unknown>>(
        `UPDATE authoring_sessions SET source_status = $2, updated_at = NOW()
         WHERE id = $1
         RETURNING id, test_case_id AS "testCaseId", requirement, status, risk_level AS "riskLevel", source_status AS "sourceStatus", draft_graph AS "draftGraph", diagnostics, approved_workflow_version_id AS "approvedWorkflowVersionId", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [id, sourceStatus],
      );
      return rows[0] ? sessionRecord(rows[0]) : undefined;
    },
    async saveCompiledDraft(id, graph, diagnostics) {
      const { rows } = await pool.query<Record<string, unknown>>(
        `UPDATE authoring_sessions SET draft_graph = $2::jsonb, diagnostics = $3::jsonb, updated_at = NOW()
         WHERE id = $1
         RETURNING id, test_case_id AS "testCaseId", requirement, status, risk_level AS "riskLevel", source_status AS "sourceStatus", draft_graph AS "draftGraph", diagnostics, approved_workflow_version_id AS "approvedWorkflowVersionId", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [id, JSON.stringify(graph), JSON.stringify(diagnostics)],
      );
      return rows[0] ? sessionRecord(rows[0]) : undefined;
    },
  };
}
