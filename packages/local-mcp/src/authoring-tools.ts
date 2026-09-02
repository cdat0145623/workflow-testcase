import {
  authoringEventInputSchema,
  authoringRiskLevelSchema,
  type AuthoringEventInput,
} from "@cwa-dev/sendkit-workflow-contract";
import { z } from "zod";

import { searchSource } from "./source-search";
import type { SourceWorkspaces } from "./source-workspaces";
import type { WorkflowAuthoringClient } from "./workflow-client";

interface ToolServer {
  registerTool(name: string, config: { title: string; description: string; inputSchema: z.ZodRawShape }, handler: (input: Record<string, unknown>) => Promise<unknown>): void;
}

function result(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

const sessionIdSchema = z.string().uuid();
const startSchema = z.object({
  testCaseId: z.string().uuid(),
  requirement: z.string().trim().min(1).max(2_000),
  riskLevel: authoringRiskLevelSchema,
}).strict();

export function registerAuthoringTools(server: ToolServer, { client, sourceWorkspaces }: { client: WorkflowAuthoringClient; sourceWorkspaces: SourceWorkspaces }) {
  server.registerTool("authoring_start", {
    title: "Start workflow authoring",
    description: "Create an authoring session for one explicit SendKit test case before source discovery.",
    inputSchema: startSchema.shape,
  }, async (input) => result(await client.start(startSchema.parse(input))));

  server.registerTool("authoring_search_source", {
    title: "Search allowlisted source",
    description: "Search a configured local source workspace and return only relative paths and redacted snippets.",
    inputSchema: z.object({ workspaceKey: z.string().min(1), query: z.string().min(1).max(200), limit: z.number().int().min(1).max(50).optional() }).shape,
  }, async (input) => result(await searchSource({
    workspaces: sourceWorkspaces,
    workspaceKey: z.string().min(1).parse(input.workspaceKey),
    query: z.string().min(1).max(200).parse(input.query),
    ...(input.limit === undefined ? {} : { limit: z.number().int().min(1).max(50).parse(input.limit) }),
  })));

  const eventTools: Array<{ name: string; title: string; description: string; eventKind: AuthoringEventInput["kind"] }> = [
    { name: "authoring_add_source_evidence", title: "Record source evidence", description: "Record source evidence before browser discovery.", eventKind: "source_evidence_added" },
    { name: "authoring_add_business_rule", title: "Record business rule", description: "Record a source-backed business rule and required coverage tags.", eventKind: "business_rule_added" },
    { name: "authoring_set_test_plan", title: "Set test plan", description: "Record scope and expected outcomes before browser discovery completes.", eventKind: "test_plan_set" },
    { name: "authoring_record_action", title: "Record browser action", description: "Record one observed browser action and its verified locator candidates.", eventKind: "action_recorded" },
    { name: "authoring_record_decision", title: "Record decision", description: "Record a decision, its evidence and confidence.", eventKind: "decision_recorded" },
  ];

  for (const tool of eventTools) {
    server.registerTool(tool.name, {
      title: tool.title,
      description: tool.description,
      inputSchema: z.object({ sessionId: sessionIdSchema, payload: z.unknown() }).strict().shape,
    }, async (input) => {
      const parsed = z.object({ sessionId: sessionIdSchema, payload: z.unknown() }).strict().parse(input);
      const event = authoringEventInputSchema.parse({ kind: tool.eventKind, payload: parsed.payload });
      return result(await client.appendEvent(parsed.sessionId, event));
    });
  }

  server.registerTool("authoring_begin_browser_discovery", {
    title: "Begin browser discovery",
    description: "Move a source-reviewed session into browser discovery only after source prerequisites are recorded.",
    inputSchema: z.object({ sessionId: sessionIdSchema }).shape,
  }, async (input) => result(await client.beginBrowserDiscovery(sessionIdSchema.parse(input.sessionId))));

  server.registerTool("authoring_request_review", {
    title: "Request workflow review",
    description: "Move browser discovery to human review after recorded actions exist.",
    inputSchema: z.object({ sessionId: sessionIdSchema }).shape,
  }, async (input) => result(await client.requestReview(sessionIdSchema.parse(input.sessionId))));

  server.registerTool("authoring_compile", {
    title: "Compile workflow draft",
    description: "Compile recorded evidence and browser actions into a deterministic draft graph; this cannot approve it.",
    inputSchema: z.object({ sessionId: sessionIdSchema }).shape,
  }, async (input) => result(await client.compile(sessionIdSchema.parse(input.sessionId))));

  server.registerTool("authoring_attach_artifact", {
    title: "Attach browser screenshot evidence",
    description: "Upload a PNG or JPEG screenshot supplied as base64 evidence. The original local path is never sent or stored.",
    inputSchema: z.object({ sessionId: sessionIdSchema, label: z.string().trim().min(1).max(200), mimeType: z.enum(["image/png", "image/jpeg"]), base64: z.string().min(4).max(7_000_000) }).strict().shape,
  }, async (input) => {
    const parsed = z.object({ sessionId: sessionIdSchema, label: z.string().trim().min(1).max(200), mimeType: z.enum(["image/png", "image/jpeg"]), base64: z.string().min(4).max(7_000_000) }).strict().parse(input);
    return result(await client.uploadArtifact(parsed.sessionId, { label: parsed.label, mimeType: parsed.mimeType, bytes: Uint8Array.from(atob(parsed.base64), (character) => character.charCodeAt(0)) }));
  });

  server.registerTool("authoring_status", {
    title: "Get authoring status",
    description: "Read the session, evidence, action trace and decision log without changing it.",
    inputSchema: z.object({ sessionId: sessionIdSchema }).shape,
  }, async (input) => result(await client.getStatus(sessionIdSchema.parse(input.sessionId))));
}
