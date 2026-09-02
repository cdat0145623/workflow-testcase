import { expect, test } from "bun:test";

import { validateGraph } from "./validate-graph";
import type { WorkflowGraph, WorkflowNode } from "./types";

function node(id: string, type: WorkflowNode["data"]["type"], values: Record<string, string> = {}): WorkflowNode {
  return {
    id,
    type: "step",
    position: { x: 0, y: 0 },
    data: { type, kind: type === "start" ? "trigger" : "action", title: id, values },
  };
}

function graph(nodes: WorkflowNode[], pairs: Array<[string, string]>): WorkflowGraph {
  return { nodes, edges: pairs.map(([source, target], index) => ({ id: `edge-${index}`, source, target })) };
}

test("accepts a valid linear deterministic graph", () => {
  const input = graph(
    [node("start", "start"), node("open", "open-url", { url: "{{baseUrl}}/login" }), node("shot", "screenshot")],
    [["start", "open"], ["open", "shot"]],
  );
  expect(validateGraph(input)).toEqual([]);
});

test("rejects missing or duplicate Start nodes", () => {
  expect(validateGraph(graph([node("open", "open-url", { url: "/" })], []))[0]?.code).toBe("start_count");
  expect(validateGraph(graph([node("a", "start"), node("b", "start")], [["a", "b"]]))[0]?.code).toBe("start_count");
});

test("rejects disconnected nodes, cycles, branches and merges", () => {
  const disconnected = graph([node("start", "start"), node("open", "open-url", { url: "/" }), node("shot", "screenshot")], [["start", "open"]]);
  expect(validateGraph(disconnected).some((problem) => problem.code === "disconnected_node" && problem.nodeId === "shot")).toBe(true);

  const cycle = graph([node("start", "start"), node("open", "open-url", { url: "/" })], [["start", "open"], ["open", "start"]]);
  expect(validateGraph(cycle).some((problem) => problem.code === "cycle")).toBe(true);

  const branch = graph([node("start", "start"), node("a", "screenshot"), node("b", "screenshot")], [["start", "a"], ["start", "b"]]);
  expect(validateGraph(branch).some((problem) => problem.code === "branch" && problem.nodeId === "start")).toBe(true);

  const merge = graph([node("start", "start"), node("a", "screenshot"), node("b", "screenshot")], [["start", "a"], ["a", "b"], ["start", "b"]]);
  expect(validateGraph(merge).some((problem) => problem.code === "merge" && problem.nodeId === "b")).toBe(true);
});

test("rejects missing required values and invalid locators", () => {
  const missing = graph([node("start", "start"), node("open", "open-url")], [["start", "open"]]);
  expect(validateGraph(missing).some((problem) => problem.code === "required_field" && problem.nodeId === "open")).toBe(true);

  const badLocator = graph([
    node("start", "start"),
    node("click", "click", { locatorStrategy: "magic", locatorValue: "submit" }),
  ], [["start", "click"]]);
  expect(validateGraph(badLocator).some((problem) => problem.code === "invalid_locator" && problem.nodeId === "click")).toBe(true);
});
