import { expect, test } from "bun:test";

import { compileGraph } from "./compile-graph";
import type { WorkflowGraph, WorkflowNode } from "./types";

function node(id: string, type: WorkflowNode["data"]["type"], values: Record<string, string> = {}): WorkflowNode {
  return { id, type: "step", position: { x: 0, y: 0 }, data: { type, kind: type === "start" ? "trigger" : "action", title: id, values } };
}

test("compiles a linear graph into the Phase 1 workflow contract", () => {
  const nodes = [
    node("start", "start"),
    node("open", "open-url", { url: "{{baseUrl}}/login" }),
    node("email", "fill", { locatorStrategy: "test_id", locatorValue: "email", value: "{{email}}" }),
    node("submit", "click", { locatorStrategy: "role", locatorRole: "button", locatorName: "Sign in", timeout: "5000" }),
    node("dashboard", "expect-visible", { locatorStrategy: "test_id", locatorValue: "dashboard" }),
    node("capture", "screenshot", { fullPage: "true" }),
  ];
  const edges = [
    ["start", "open"], ["open", "email"], ["email", "submit"], ["submit", "dashboard"], ["dashboard", "capture"],
  ].map(([source, target], index) => ({ id: `edge-${index}`, source: source!, target: target! }));

  const result = compileGraph({ graph: { nodes, edges } satisfies WorkflowGraph, workflowVersionId: "login-v1" });

  expect(result).toEqual({
    workflowVersionId: "login-v1",
    steps: [
      { id: "open", type: "open_url", url: "{{baseUrl}}/login" },
      { id: "email", type: "fill", locator: { strategy: "test_id", value: "email" }, value: "{{email}}" },
      { id: "submit", type: "click", locator: { strategy: "role", role: "button", name: "Sign in" }, timeout: 5000 },
      { id: "dashboard", type: "expect_visible", locator: { strategy: "test_id", value: "dashboard" } },
      { id: "capture", type: "screenshot", fullPage: true },
    ],
  });
});

test("refuses to compile an invalid graph", () => {
  expect(() => compileGraph({ graph: { nodes: [node("start", "start")], edges: [] }, workflowVersionId: "invalid" })).toThrow("Graph is invalid");
});
