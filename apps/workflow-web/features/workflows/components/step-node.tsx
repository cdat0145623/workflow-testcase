"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import { cn } from "@/lib/utils";
import { nodeRegistry } from "../model/node-registry";
import type { WorkflowNode } from "../model/types";
import { NodeIcon } from "./node-icon";

function StepNodeComponent({ data, selected }: NodeProps<WorkflowNode>) {
  const definition = nodeRegistry[data.type];
  const visibleFields = definition.fields.filter((field) => data.values[field.key]);

  return (
    <article
      aria-label={`${data.title} workflow step`}
      className={cn(
        "min-w-56 max-w-80 rounded-lg border border-slate-700 bg-slate-900 text-slate-100 shadow-xl shadow-black/15",
        selected && "border-sky-400 ring-2 ring-sky-400/25",
      )}
    >
      {data.kind !== "trigger" && (
        <Handle
          type="target"
          position={Position.Left}
          className="h-4! w-2! min-w-0! rounded-l-sm! rounded-r-none! border-0! bg-slate-500!"
        />
      )}
      <div className="flex items-center gap-2.5 px-3 py-3">
        <NodeIcon type={data.type} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{data.title}</p>
          <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{definition.kind}</p>
        </div>
      </div>
      {visibleFields.length > 0 && (
        <div className="space-y-1.5 border-t border-slate-800 px-3 py-2.5">
          {visibleFields.slice(0, 3).map((field) => (
            <div key={field.key} className="flex gap-3 text-xs">
              <span className="shrink-0 text-slate-500">{field.label}</span>
              <span className="ml-auto max-w-44 truncate font-mono text-slate-300">{data.values[field.key]}</span>
            </div>
          ))}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="h-4! w-2! min-w-0! rounded-l-none! rounded-r-sm! border-0! bg-slate-500!"
      />
    </article>
  );
}

export const StepNode = memo(StepNodeComponent);
