import { expect, test } from "bun:test";

import { approveAuthoringSession } from "./approval-service";

const graph = {
  nodes: [
    { id: "start", type: "step", position: { x: 0, y: 0 }, data: { type: "start", kind: "trigger", title: "Start", values: {} } },
    { id: "open", type: "step", position: { x: 1, y: 0 }, data: { type: "open-url", kind: "action", title: "Open", values: { url: "{{baseUrl}}" } } },
  ],
  edges: [{ id: "start-open", source: "start", target: "open" }],
};

function poolFor(session: Record<string, unknown>) {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const client = {
    async query(sql: string, values?: unknown[]) {
      queries.push({ sql, values });
      if (sql.includes("FROM authoring_sessions")) return { rows: [session] };
      if (sql.includes("MAX(version_number)")) return { rows: [{ versionNumber: 3 }] };
      return { rows: [] };
    },
    release() {},
  };
  return { pool: { async connect() { return client; } }, queries };
}

test("approval creates an immutable version and never calls a worker", async () => {
  const updatedAt = new Date("2026-09-02T00:00:00.000Z");
  const { pool, queries } = poolFor({
    id: "session-1", testCaseId: "case-1", status: "needs_review", sourceStatus: "complete", draftGraph: graph,
    diagnostics: [], approvedWorkflowVersionId: null, updatedAt,
  });

  const version = await approveAuthoringSession({ pool: pool as never, sessionId: "session-1", expectedUpdatedAt: updatedAt.toISOString() });

  expect(version.versionNumber).toBe(3);
  expect(version.workflow.workflowVersionId).toBe(version.id);
  expect(queries.some(({ sql }) => sql.includes("INSERT INTO workflow_versions"))).toBe(true);
  expect(queries.some(({ sql }) => sql.includes("UPDATE authoring_sessions SET status = 'approved'"))).toBe(true);
  expect(queries.some(({ sql }) => /worker|runs/i.test(sql))).toBe(false);
});

test("approval rejects incomplete, stale, and blocked authoring sessions", async () => {
  const updatedAt = new Date("2026-09-02T00:00:00.000Z");
  for (const session of [
    { id: "a", testCaseId: "case", status: "needs_review", sourceStatus: "pending", draftGraph: graph, diagnostics: [], approvedWorkflowVersionId: null, updatedAt },
    { id: "b", testCaseId: "case", status: "needs_review", sourceStatus: "complete", draftGraph: graph, diagnostics: [{ severity: "blocker", message: "missing locator" }], approvedWorkflowVersionId: null, updatedAt },
  ]) {
    const { pool } = poolFor(session);
    await expect(approveAuthoringSession({ pool: pool as never, sessionId: session.id, expectedUpdatedAt: updatedAt.toISOString() })).rejects.toThrow();
  }
  const { pool } = poolFor({ id: "c", testCaseId: "case", status: "needs_review", sourceStatus: "complete", draftGraph: graph, diagnostics: [], approvedWorkflowVersionId: null, updatedAt });
  await expect(approveAuthoringSession({ pool: pool as never, sessionId: "c", expectedUpdatedAt: "2026-09-02T00:00:01.000Z" })).rejects.toThrow("changed");
});
