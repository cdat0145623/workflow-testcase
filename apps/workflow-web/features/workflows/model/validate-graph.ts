import { locatorStrategies, nodeRegistry, type NodeDefinition } from "./node-registry";
import type { GraphProblem, WorkflowGraph } from "./types";

export function validateGraph({ nodes, edges }: WorkflowGraph): GraphProblem[] {
  const problems: GraphProblem[] = [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const starts = nodes.filter((node) => node.data.type === "start");

  if (starts.length !== 1) {
    problems.push({ code: "start_count", message: `A workflow needs exactly one Start node (found ${starts.length}).` });
  }
  if (nodes.filter((node) => node.data.type !== "start").length === 0) {
    problems.push({ code: "empty_workflow", message: "A workflow needs at least one executable node." });
  }

  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) {
      problems.push({ code: "unknown_edge_node", message: `Edge ${edge.id} references an unknown node.` });
      continue;
    }
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source]);
  }

  for (const node of nodes) {
    if ((outgoing.get(node.id)?.length ?? 0) > 1) problems.push({ code: "branch", nodeId: node.id, message: "Branching is not supported in Phase 2." });
    if ((incoming.get(node.id)?.length ?? 0) > 1) problems.push({ code: "merge", nodeId: node.id, message: "Merging is not supported in Phase 2." });

    const definition: NodeDefinition = nodeRegistry[node.data.type];
    for (const field of definition.fields) {
      if (field.required && !node.data.values[field.key]?.trim()) {
        problems.push({ code: "required_field", nodeId: node.id, message: `${field.label} is required.` });
      }
    }
    if (definition.requiresLocator) {
      const strategy = node.data.values.locatorStrategy;
      const validStrategy = locatorStrategies.includes(strategy as (typeof locatorStrategies)[number]);
      const hasLocator = strategy === "role"
        ? Boolean(node.data.values.locatorRole?.trim())
        : Boolean(node.data.values.locatorValue?.trim());
      if (!validStrategy || !hasLocator) {
        problems.push({ code: "invalid_locator", nodeId: node.id, message: "Choose a valid locator strategy and value." });
      }
    }
    const timeout = node.data.values.timeout;
    if (timeout !== undefined && (!Number.isFinite(Number(timeout)) || Number(timeout) <= 0)) {
      problems.push({ code: "invalid_timeout", nodeId: node.id, message: "Timeout must be a positive number." });
    }
  }

  const visited = new Set<string>();
  let current: string | undefined = starts[0]?.id;
  while (current) {
    if (visited.has(current)) {
      problems.push({ code: "cycle", nodeId: current, message: "Workflow contains a cycle." });
      break;
    }
    visited.add(current);
    current = outgoing.get(current)?.[0];
  }

  for (const node of nodes) {
    if (node.data.type !== "start" && !visited.has(node.id)) {
      problems.push({ code: "disconnected_node", nodeId: node.id, message: `${node.data.title} is disconnected from Start.` });
    }
  }

  return problems;
}
