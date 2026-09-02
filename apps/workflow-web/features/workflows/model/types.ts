import type { Edge, Node } from "@xyflow/react";

import type { NodeType } from "./node-registry";

export type WorkflowNodeKind = "trigger" | "action";

export interface WorkflowNodeData extends Record<string, unknown> {
  type: NodeType;
  kind: WorkflowNodeKind;
  title: string;
  values: Record<string, string>;
}

export type WorkflowNode = Node<WorkflowNodeData, "step">;
export type WorkflowEdge = Edge;

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface GraphProblem {
  code:
    | "start_count"
    | "empty_workflow"
    | "unknown_edge_node"
    | "branch"
    | "merge"
    | "cycle"
    | "disconnected_node"
    | "required_field"
    | "invalid_locator"
    | "invalid_timeout";
  nodeId?: string;
  message: string;
}
