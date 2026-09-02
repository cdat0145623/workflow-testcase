"use client";

import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

import { useWorkflowRuns } from "../runs/workflow-runs-provider";
import { ArtifactViewer } from "./artifact-viewer";
import type { ConsoleSelection } from "./logs-panel";
import { RunVariablesDialog } from "./run-variables-dialog";
import type { WorkflowVersionDetail } from "../versions/types";
import { extractRuntimeFields } from "../runtime-values/field-registry";
import { useRuntimeValues } from "../runtime-values/use-runtime-values";

export function InspectorPanel({ selection }: { selection: ConsoleSelection }) {
  const runs = useWorkflowRuns();
  const [replayVariablesOpen, setReplayVariablesOpen] = useState(false);
  const [version, setVersion] = useState<WorkflowVersionDetail | null>(null);
  const run = runs.latestRun;
  const runtime = useRuntimeValues(runs.testCaseId, replayVariablesOpen, run?.workflowVersionId);
  useEffect(() => {
    if (!replayVariablesOpen || !run) return;
    let disposed = false;
    void fetch(`/api/workflow-versions/${encodeURIComponent(run.workflowVersionId)}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Workflow version not found");
        return body as WorkflowVersionDetail;
      })
      .then((detail) => { if (!disposed) setVersion(detail); })
      .catch(() => { if (!disposed) setVersion(null); });
    return () => { disposed = true; };
  }, [replayVariablesOpen, run]);
  if (!run || run.id !== selection.runId) return null;
  if (selection.kind === "run") {
    return (
      <div className="flex size-full flex-col p-3 text-xs">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-slate-200">Run artifacts</p>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setReplayVariablesOpen(true)}>
            <RotateCcw aria-hidden="true" className="size-3.5" /> Run again
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <a className="rounded border border-slate-700 px-3 py-2 text-sky-300 hover:bg-slate-900" href={`/api/artifacts/${run.id}/report.html`} target="_blank">HTML report</a>
          <a className="rounded border border-slate-700 px-3 py-2 text-sky-300 hover:bg-slate-900" href={`/api/artifacts/${run.id}/report.json`} target="_blank">JSON report</a>
          <a className="rounded border border-slate-700 px-3 py-2 text-sky-300 hover:bg-slate-900" href={`/api/artifacts/${run.id}/trace.zip`}>Trace</a>
          <a className="rounded border border-slate-700 px-3 py-2 text-sky-300 hover:bg-slate-900" href={`/api/artifacts/${run.id}/run.log`} target="_blank">Log</a>
        </div>
        {run.error && <pre className="mt-3 whitespace-pre-wrap rounded border border-red-900 bg-red-950/30 p-3 text-red-200">{run.error}</pre>}
        <RunVariablesDialog
          open={replayVariablesOpen}
          onOpenChange={setReplayVariablesOpen}
          fields={version ? extractRuntimeFields(version.graph) : []}
          initialValues={runtime.values}
          isLoading={runtime.isLoading}
          loadError={runtime.error}
          onRun={(variables) => runs.replay(run.workflowVersionId, variables)}
        />
      </div>
    );
  }
  const step = run.steps.find((item) => item.stepId === selection.stepId);
  if (!step) return null;
  return (
    <div className="size-full overflow-y-auto">
      <div className="border-b border-slate-800 p-3 text-xs">
        <p className="font-semibold text-slate-200">{step.stepId}</p>
        <p className="mt-1 text-slate-500">{step.type} · {step.status}{step.durationMs != null ? ` · ${step.durationMs} ms` : ""}</p>
        {step.error && <pre className="mt-3 whitespace-pre-wrap rounded border border-red-900 bg-red-950/30 p-3 text-red-200">{step.error}</pre>}
        {step.output && <pre className="mt-3 overflow-auto rounded bg-slate-950 p-3 text-slate-400">{JSON.stringify(step.output, null, 2)}</pre>}
      </div>
      <ArtifactViewer runId={run.id} stepId={step.stepId} />
    </div>
  );
}
