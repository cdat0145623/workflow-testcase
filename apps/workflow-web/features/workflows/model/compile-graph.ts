import { workflowSchema, type Locator, type Workflow, type WorkflowStep } from "@cwa-dev/sendkit-workflow-contract";

import { validateGraph } from "./validate-graph";
import type { WorkflowGraph, WorkflowNode } from "./types";

function timeout(values: Record<string, string>): { timeout?: number } {
  return values.timeout ? { timeout: Number(values.timeout) } : {};
}

function locator(values: Record<string, string>): Locator {
  if (values.locatorStrategy === "role") {
    return {
      strategy: "role",
      role: values.locatorRole!,
      ...(values.locatorName ? { name: values.locatorName } : {}),
    };
  }
  return { strategy: values.locatorStrategy as Exclude<Locator["strategy"], "role">, value: values.locatorValue! };
}

function compileNode(node: WorkflowNode): WorkflowStep {
  const { values } = node.data;
  const common = { id: node.id, ...timeout(values) };
  switch (node.data.type) {
    case "open-url": return { ...common, type: "open_url", url: values.url! };
    case "click": return { ...common, type: "click", locator: locator(values) };
    case "fill": return { ...common, type: "fill", locator: locator(values), value: values.value! };
    case "select": return { ...common, type: "select", locator: locator(values), option: values.option! };
    case "wait-for": return { ...common, type: "wait_for", locator: locator(values), ...(values.state ? { state: values.state as "attached" | "detached" | "visible" | "hidden" } : {}) };
    case "expect-visible": return { ...common, type: "expect_visible", locator: locator(values) };
    case "expect-text": return { ...common, type: "expect_text", locator: locator(values), text: values.text! };
    case "screenshot": return { ...common, type: "screenshot", fullPage: values.fullPage !== "false" };
    case "start": throw new Error("Start does not compile to an executable step");
  }
}

export function compileGraph({ graph, workflowVersionId }: { graph: WorkflowGraph; workflowVersionId: string }): Workflow {
  const problems = validateGraph(graph);
  if (problems.length > 0) throw new Error(`Graph is invalid: ${problems.map((problem) => problem.message).join(" ")}`);

  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const next = new Map(graph.edges.map((edge) => [edge.source, edge.target]));
  const start = graph.nodes.find((node) => node.data.type === "start")!;
  const steps: WorkflowStep[] = [];
  let nodeId = next.get(start.id);
  while (nodeId) {
    const node = byId.get(nodeId)!;
    steps.push(compileNode(node));
    nodeId = next.get(nodeId);
  }
  return workflowSchema.parse({ workflowVersionId, steps });
}
