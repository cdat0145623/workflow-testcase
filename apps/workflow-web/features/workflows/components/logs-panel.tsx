"use client";

import { Circle, CircleCheck, CircleX, LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { useWorkflowRuns } from "../runs/workflow-runs-provider";

export type ConsoleSelection = { kind: "run"; runId: string } | { kind: "step"; runId: string; stepId: string };

const statusIcon = {
  pending: Circle,
  queued: Circle,
  running: LoaderCircle,
  passed: CircleCheck,
  failed: CircleX,
  skipped: Circle,
  cancelled: CircleX,
} as const;

export function LogsPanel({ selected, onSelect }: { selected: ConsoleSelection | null; onSelect(selection: ConsoleSelection): void }) {
  const { latestRun } = useWorkflowRuns();
  if (!latestRun) return <div className="grid size-full place-items-center text-xs text-slate-500">Run this test case to see step-by-step output.</div>;
  const RunIcon = statusIcon[latestRun.status];
  return (
    <div className="size-full overflow-y-auto p-2">
      <button
        type="button"
        onClick={() => onSelect({ kind: "run", runId: latestRun.id })}
        className={cn("flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-slate-900", selected?.kind === "run" && "bg-slate-800")}
      >
        <RunIcon aria-hidden="true" className={cn("size-4", latestRun.status === "running" && "animate-spin", latestRun.status === "passed" ? "text-emerald-400" : latestRun.status === "failed" ? "text-red-400" : "text-slate-400")} />
        <span className="font-mono text-slate-300">{latestRun.id.slice(0, 18)}…</span>
        <span className="ml-auto lowercase text-slate-500">{latestRun.status}</span>
      </button>
      <div className="ml-4 border-l border-slate-800 pl-2">
        {latestRun.steps.map((step) => {
          const StepIcon = statusIcon[step.status];
          return (
            <button
              key={step.stepId}
              type="button"
              onClick={() => onSelect({ kind: "step", runId: latestRun.id, stepId: step.stepId })}
              className={cn("flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-slate-900", selected?.kind === "step" && selected.stepId === step.stepId && "bg-slate-800")}
            >
              <StepIcon aria-hidden="true" className={cn("size-3.5", step.status === "running" && "animate-spin", step.status === "passed" ? "text-emerald-400" : step.status === "failed" ? "text-red-400" : "text-slate-500")} />
              <span className={cn("truncate font-medium text-slate-300", step.status === "failed" && "text-red-300")}>{step.stepId}</span>
              {step.durationMs != null && <span className="ml-auto text-slate-600">{step.durationMs} ms</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
