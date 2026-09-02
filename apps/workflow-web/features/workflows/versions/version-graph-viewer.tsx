"use client";

import { Background, BackgroundVariant, Controls, ReactFlow, type NodeTypes } from "@xyflow/react";

import type { WorkflowGraph, WorkflowNode } from "../model/types";
import { StepNode } from "../components/step-node";

import "@xyflow/react/dist/style.css";

const nodeTypes = { step: StepNode } satisfies NodeTypes;

export function VersionGraphViewer({ graph }: { graph: WorkflowGraph }) {
  return (
    <div aria-label="Immutable workflow graph" className="h-72 overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
      <ReactFlow<WorkflowNode>
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        colorMode="dark"
        fitView
        minZoom={0.35}
        maxZoom={1.5}
        defaultEdgeOptions={{ type: "smoothstep", style: { stroke: "#475569", strokeWidth: 2 } }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1e293b" gap={24} size={1} variant={BackgroundVariant.Dots} />
        <Controls position="bottom-left" showInteractive={false} className="workflow-controls overflow-hidden rounded-lg! border! border-slate-700! bg-slate-900! shadow-xl!" />
      </ReactFlow>
    </div>
  );
}
