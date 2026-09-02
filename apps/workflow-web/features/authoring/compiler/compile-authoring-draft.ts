import type {
  AuthoringDecision,
  AuthoringDiagnostic,
  AuthoringRiskLevel,
  Locator,
  RecordedAction,
  SourceBusinessRule,
} from "@cwa-dev/sendkit-workflow-contract";

import { compileGraph } from "@/features/workflows/model/compile-graph";
import type { NodeType } from "@/features/workflows/model/node-registry";
import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from "@/features/workflows/model/types";
import { validateGraph } from "@/features/workflows/model/validate-graph";

import { selectVerifiedLocator } from "./locator-ranking";

export interface AuthoringCompilerInput {
  riskLevel: AuthoringRiskLevel;
  businessRules: SourceBusinessRule[];
  actions: RecordedAction[];
  decisions?: AuthoringDecision[];
}

export interface AuthoringDraftResult {
  graph: WorkflowGraph;
  diagnostics: AuthoringDiagnostic[];
  decisions: AuthoringDecision[];
}

function locatorValues(locator: Locator): Record<string, string> {
  if (locator.strategy === "role") {
    return {
      locatorStrategy: "role",
      locatorRole: locator.role,
      ...(locator.name ? { locatorName: locator.name } : {}),
    };
  }
  return { locatorStrategy: locator.strategy, locatorValue: locator.value };
}

function mappedType(action: RecordedAction): NodeType {
  switch (action.kind) {
    case "navigate": return "open-url";
    case "click": return "click";
    case "fill": return "fill";
    case "select": return "select";
    case "wait": return "wait-for";
    case "assert_visible": return "expect-visible";
    case "assert_text": return "expect-text";
    case "screenshot": return "screenshot";
  }
}

function requiresLocator(type: NodeType): boolean {
  return !["start", "open-url", "screenshot"].includes(type);
}

function valuesFor(action: RecordedAction, type: NodeType, locator?: Locator): Record<string, string> {
  const values: Record<string, string> = {};
  if (type === "open-url") values.url = action.targetUrl ?? "";
  if (type === "fill") values.value = action.value ?? "";
  if (type === "select") values.option = action.value ?? "";
  if (type === "expect-text") values.text = action.value ?? "";
  if (locator) Object.assign(values, locatorValues(locator));
  return values;
}

function node({ id, type, title, values, position }: { id: string; type: NodeType; title: string; values: Record<string, string>; position: { x: number; y: number } }): WorkflowNode {
  return { id, type: "step", position, data: { type, kind: type === "start" ? "trigger" : "action", title, values } };
}

function coverageDiagnostics(rules: SourceBusinessRule[], actions: RecordedAction[]): AuthoringDiagnostic[] {
  const coverage = new Set(actions.flatMap((action) => action.coverageTags));
  return rules.flatMap((rule) => rule.requiredCoverageTags
    .filter((tag) => !coverage.has(tag))
    .map((tag) => ({
      code: "business_rule_uncovered" as const,
      severity: "blocker" as const,
      ruleId: rule.id,
      message: `Business rule ${rule.id} is missing required coverage tag: ${tag}`,
    })));
}

export function compileAuthoringDraft({ riskLevel, businessRules, actions, decisions = [] }: AuthoringCompilerInput): AuthoringDraftResult {
  const diagnostics: AuthoringDiagnostic[] = coverageDiagnostics(businessRules, actions);
  const nodes: WorkflowNode[] = [node({ id: "start", type: "start", title: "Start", values: {}, position: { x: 0, y: 0 } })];
  const edges: WorkflowEdge[] = [];
  let previousId = "start";
  let position = 300;

  for (const action of actions) {
    const type = mappedType(action);
    const locator = requiresLocator(type) ? selectVerifiedLocator(action.locatorCandidates) : undefined;
    if (requiresLocator(type) && !locator) {
      diagnostics.push({ code: "locator_unverified", severity: "blocker", actionId: action.id, message: `Action ${action.id} has no unique verified locator.` });
    }
    if (riskLevel !== "read_only" && ["click", "fill", "select"].includes(action.kind) && action.artifactIds.length === 0) {
      diagnostics.push({ code: "write_action_unverified", severity: "blocker", actionId: action.id, message: `Write action ${action.id} requires browser evidence before review.` });
    }

    nodes.push(node({ id: action.id, type, title: action.label, values: valuesFor(action, type, locator), position: { x: position, y: 0 } }));
    edges.push({ id: `${previousId}-${action.id}`, source: previousId, target: action.id, type: "smoothstep" });
    previousId = action.id;
    position += 300;

    if (action.waitFor) {
      const waitId = `${action.id}-wait`;
      nodes.push(node({
        id: waitId,
        type: "wait-for",
        title: `Wait after ${action.label}`,
        values: locatorValues(action.waitFor.locator),
        position: { x: position, y: 0 },
      }));
      edges.push({ id: `${previousId}-${waitId}`, source: previousId, target: waitId, type: "smoothstep" });
      previousId = waitId;
      position += 300;
    }
  }

  const graph = { nodes, edges };
  const graphProblems = validateGraph(graph);
  diagnostics.push(...graphProblems.map((problem) => ({
    code: "graph_invalid" as const,
    severity: "blocker" as const,
    message: problem.message,
    ...(problem.nodeId ? { actionId: problem.nodeId } : {}),
  })));
  if (!diagnostics.some((diagnostic) => diagnostic.severity === "blocker")) {
    try {
      compileGraph({ graph, workflowVersionId: "authoring-draft-validation" });
    } catch (error) {
      diagnostics.push({ code: "graph_invalid", severity: "blocker", message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { graph, diagnostics, decisions };
}
