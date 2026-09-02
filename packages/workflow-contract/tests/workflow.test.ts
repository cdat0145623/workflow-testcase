import { describe, expect, test } from "bun:test";

import { runRequestSchema, workflowSchema } from "../src/index";

describe("workflow contract", () => {
  test("accepts a deterministic workflow", () => {
    expect(
      workflowSchema.parse({
        workflowVersionId: "login-v1",
        steps: [{ id: "open", type: "open_url", url: "{{baseUrl}}/login" }],
      }),
    ).toBeDefined();
  });

  test("rejects an LLM-dependent step", () => {
    expect(() =>
      workflowSchema.parse({
        workflowVersionId: "bad-v1",
        steps: [{ id: "agent", type: "agent", prompt: "find login" }],
      }),
    ).toThrow();
  });

  test("rejects duplicate step ids", () => {
    expect(() =>
      workflowSchema.parse({
        workflowVersionId: "bad-v1",
        steps: [
          { id: "open", type: "open_url", url: "https://example.com" },
          { id: "open", type: "screenshot" },
        ],
      }),
    ).toThrow("Duplicate step id: open");
  });

  test("accepts variables in a run request", () => {
    expect(
      runRequestSchema.parse({
        baseUrl: "http://host.docker.internal:3000",
        variables: { email: "test@example.com" },
        workflow: {
          workflowVersionId: "login-v1",
          steps: [{ id: "open", type: "open_url", url: "{{baseUrl}}/login" }],
        },
      }),
    ).toBeDefined();
  });
});
