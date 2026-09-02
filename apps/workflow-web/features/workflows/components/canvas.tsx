"use client";

import { Background, BackgroundVariant, ConnectionLineType, Controls, ReactFlow, type NodeTypes } from "@xyflow/react";

import type { WorkflowNode } from "../model/types";
import { StepNode } from "./step-node";
import { useWorkflowEditor } from "./workflow-editor-provider";

import "@xyflow/react/dist/style.css";

const nodeTypes = { step: StepNode } satisfies NodeTypes;

export function Canvas() {
  const editor = useWorkflowEditor();

  return (
    <div id="workflow-canvas" className="h-full min-h-0 w-full bg-slate-950">
      <ReactFlow<WorkflowNode>
        nodes={editor.graph.nodes}
        edges={editor.graph.edges}
        nodeTypes={nodeTypes}
        onNodesChange={editor.onNodesChange}
        onEdgesChange={editor.onEdgesChange}
        onConnect={editor.onConnect}
        onSelectionChange={({ nodes }) => editor.selectNode(nodes[0]?.id ?? null)}
        onDelete={({ nodes, edges }) => editor.deleteElements(nodes.map((node) => node.id), edges.map((edge) => edge.id))}
        colorMode="dark"
        fitView
        minZoom={0.35}
        maxZoom={1.5}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={{ stroke: "#64748b", strokeWidth: 2 }}
        defaultEdgeOptions={{ type: "smoothstep", style: { stroke: "#475569", strokeWidth: 2 } }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1e293b" gap={24} size={1} variant={BackgroundVariant.Dots} />
        <Controls
          position="bottom-left"
          showInteractive={false}
          className="workflow-controls overflow-hidden rounded-lg! border! border-slate-700! bg-slate-900! shadow-xl!"
        />
      </ReactFlow>
    </div>
  );
}
