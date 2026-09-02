import { expect, test } from "bun:test";

import { createWorkflowAuthoringClient } from "../src/workflow-client";
import { registerAuthoringTools } from "../src/authoring-tools";

test("authoring client sends explicit test-case and session identities", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createWorkflowAuthoringClient({
    baseUrl: "http://workflow.test",
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return Response.json({ data: { id: "session-1", status: "source_review" } }, { status: 201 });
    },
  });

  await client.start({ testCaseId: "00000000-0000-4000-8000-000000000001", requirement: "Verify login.", riskLevel: "read_only" });

  expect(calls[0]?.url).toBe("http://workflow.test/api/authoring/sessions");
  expect(calls[0]?.init?.method).toBe("POST");
  expect(calls[0]?.init?.body).toContain("00000000-0000-4000-8000-000000000001");
});

test("local MCP registers source-aware tools and keeps approval out of the tool list", () => {
  const names: string[] = [];
  const fakeServer = {
    registerTool(name: string) { names.push(name); },
  };

  registerAuthoringTools(fakeServer as never, {
    client: {} as never,
    sourceWorkspaces: new Map(),
  });

  expect(names).toContain("authoring_start");
  expect(names).toContain("authoring_search_source");
  expect(names).toContain("authoring_record_action");
  expect(names).toContain("authoring_status");
  expect(names).toContain("authoring_attach_artifact");
  expect(names).not.toContain("authoring_approve");
});
