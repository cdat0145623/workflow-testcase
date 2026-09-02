import { describe, expect, test } from "bun:test";

import type { AuthoringEventInput, AuthoringRiskLevel, AuthoringSessionStatus } from "@cwa-dev/sendkit-workflow-contract";
import { createAuthoringService, type AuthoringServicePorts } from "./service";
import type { AuthoringEventRecord, AuthoringSessionRecord } from "./repository";

function fixture() {
  const sessions = new Map<string, AuthoringSessionRecord>();
  const events = new Map<string, AuthoringEventRecord[]>();
  let nextId = 0;
  const ports: AuthoringServicePorts = {
    repository: {
      async createSession(input) {
        const id = `session-${++nextId}`;
        const session: AuthoringSessionRecord = {
          id,
          testCaseId: input.testCaseId,
          requirement: input.requirement,
          status: "drafting",
          riskLevel: input.riskLevel,
          sourceStatus: "pending",
          diagnostics: [],
          createdAt: "2026-09-02T00:00:00.000Z",
          updatedAt: "2026-09-02T00:00:00.000Z",
        };
        sessions.set(id, session);
        events.set(id, []);
        return session;
      },
      async getSession(id) { return sessions.get(id); },
      async listSessions(testCaseId) { return [...sessions.values()].filter((session) => session.testCaseId === testCaseId); },
      async appendEvent(sessionId, event) {
        const existing = events.get(sessionId) ?? [];
        const record: AuthoringEventRecord = {
          id: `event-${existing.length + 1}`,
          sessionId,
          sequence: existing.length + 1,
          kind: event.kind,
          payload: event.payload,
          createdAt: "2026-09-02T00:00:00.000Z",
        };
        existing.push(record);
        events.set(sessionId, existing);
        return record;
      },
      async listEvents(sessionId) { return events.get(sessionId) ?? []; },
      async transition(id, from, to) {
        const current = sessions.get(id);
        if (!current || current.status !== from) return undefined;
        const next = { ...current, status: to, updatedAt: "2026-09-02T00:01:00.000Z" };
        sessions.set(id, next);
        return next;
      },
      async updateSourceStatus(id, sourceStatus) {
        const current = sessions.get(id);
        if (!current) return undefined;
        const next = { ...current, sourceStatus, updatedAt: "2026-09-02T00:01:00.000Z" };
        sessions.set(id, next);
        return next;
      },
      async saveCompiledDraft(id, graph, diagnostics) {
        const current = sessions.get(id);
        if (!current) return undefined;
        const next = { ...current, draftGraph: graph, diagnostics, updatedAt: "2026-09-02T00:01:00.000Z" };
        sessions.set(id, next);
        return next;
      },
    },
  };
  return { service: createAuthoringService(ports), sessions, events };
}

async function startSourceReview(service: ReturnType<typeof createAuthoringService>, riskLevel: AuthoringRiskLevel = "write") {
  return service.start({ testCaseId: "case-1", requirement: "Verify the employee calendar task flow.", riskLevel });
}

const sourceEvidence: AuthoringEventInput = {
  kind: "source_evidence_added",
  payload: {
    id: "source-calendar-filter",
    workspaceKey: "hcns",
    relativePath: "features/calendar.tsx",
    startLine: 42,
    endLine: 56,
    finding: "Calendar tasks use selectedUserId.",
    provenance: "source",
  },
};

describe("authoring service", () => {
  test("blocks browser discovery until source evidence and analysis completion exist", async () => {
    const { service } = fixture();
    const session = await startSourceReview(service);

    await expect(service.beginBrowserDiscovery(session.id)).rejects.toThrow("source evidence");
    await service.appendEvent(session.id, sourceEvidence);
    await expect(service.beginBrowserDiscovery(session.id)).rejects.toThrow("source analysis");
    await service.appendEvent(session.id, { kind: "source_analysis_completed", payload: { summary: "Calendar and modal source inspected." } });

    await expect(service.beginBrowserDiscovery(session.id)).resolves.toMatchObject({ status: "browser_discovery", sourceStatus: "complete" });
  });

  test("allows source-unavailable discovery only when a reason is persisted", async () => {
    const { service } = fixture();
    const session = await startSourceReview(service);

    await service.appendEvent(session.id, { kind: "source_unavailable", payload: { reason: "The upstream project source was not provided." } });

    await expect(service.beginBrowserDiscovery(session.id)).resolves.toMatchObject({ sourceStatus: "unavailable" });
  });

  test("rejects writes after a terminal session state", async () => {
    const { service } = fixture();
    const session = await startSourceReview(service, "read_only");

    await service.cancel(session.id);

    await expect(service.appendEvent(session.id, sourceEvidence)).rejects.toThrow("terminal");
  });

  test("records every accepted status change as an audit event", async () => {
    const { service, events } = fixture();
    const session = await startSourceReview(service);
    await service.appendEvent(session.id, sourceEvidence);
    await service.appendEvent(session.id, { kind: "source_analysis_completed", payload: { summary: "Source inspected." } });
    await service.beginBrowserDiscovery(session.id);

    expect(events.get(session.id)?.map((event) => event.kind)).toEqual([
      "status_changed",
      "source_evidence_added",
      "source_analysis_completed",
      "status_changed",
    ]);
  });

  test("persists a deterministic draft after source-backed browser actions", async () => {
    const { service } = fixture();
    const session = await startSourceReview(service);
    await service.appendEvent(session.id, sourceEvidence);
    await service.appendEvent(session.id, { kind: "source_analysis_completed", payload: { summary: "Source inspected." } });
    await service.appendEvent(session.id, {
      kind: "action_recorded",
      payload: {
        id: "open-login",
        kind: "navigate",
        label: "Open login",
        targetUrl: "http://app.test/login",
        sensitive: false,
        coverageTags: [],
        artifactIds: [],
        provenance: "browser",
      },
    });

    const result = await service.compile(session.id);

    expect(result.graph.nodes.map((node) => node.id)).toEqual(["start", "open-login"]);
    expect(result.diagnostics).toEqual([]);
  });
});
