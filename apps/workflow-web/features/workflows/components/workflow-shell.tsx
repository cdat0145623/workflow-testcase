"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { useState } from "react";
import { GitBranch } from "lucide-react";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { DemoBadge } from "@/components/demo-badge";
import type { WorkflowGraph } from "../model/types";
import { WorkflowRunsProvider } from "../runs/workflow-runs-provider";
import { Canvas } from "./canvas";
import { ConsolePanel } from "./console-panel";
import { RightSidebar } from "./right-sidebar";
import { WorkflowEditorProvider, useWorkflowEditor } from "./workflow-editor-provider";
import { useWorkflowRuns } from "../runs/workflow-runs-provider";
import { VersionsPanel } from "../versions/versions-panel";
import type { WorkflowVersionDetail } from "../versions/types";
import { RunsHistoryPanel } from "../runs/runs-history-panel";
import { RunVariablesDialog } from "./run-variables-dialog";
import { extractRuntimeFields } from "../runtime-values/field-registry";
import { useRuntimeValues } from "../runtime-values/use-runtime-values";
import { AuthoringPanel } from "@/features/authoring/components/authoring-panel";
import { RequirementForm } from "@/features/authoring/components/requirement-form";
import type { AuthoringSnapshot } from "@/features/authoring/service";

interface WorkflowShellProps {
  testCaseName: string;
  testCaseId: string;
  initialGraph: WorkflowGraph;
  onSave(graph: WorkflowGraph): Promise<void>;
  demo?: boolean;
  authoringSnapshot?: AuthoringSnapshot;
  sourceWorkspaceKey?: string;
}

function AuthoringReview({ snapshot }: { snapshot: AuthoringSnapshot }) {
  const editor = useWorkflowEditor();
  return <AuthoringPanel snapshot={snapshot} onApprove={editor.applyApprovedGraph} />;
}

function VersionReview({ testCaseId, onRestored }: { testCaseId: string; onRestored(): void }) {
  const editor = useWorkflowEditor();
  const runs = useWorkflowRuns();
  const [versionToRun, setVersionToRun] = useState<WorkflowVersionDetail | null>(null);
  const runtime = useRuntimeValues(testCaseId, versionToRun !== null, versionToRun?.id);
  return <>
    <VersionsPanel
      testCaseId={testCaseId}
      onRestore={(version) => { editor.restoreVersionGraph(version.graph, version.versionNumber); onRestored(); }}
      onRun={setVersionToRun}
    />
    {versionToRun && <RunVariablesDialog
      open
      onOpenChange={(open) => { if (!open) setVersionToRun(null); }}
      fields={runtime.fields.length ? runtime.fields : extractRuntimeFields(versionToRun.graph)}
      initialValues={runtime.values}
      isLoading={runtime.isLoading}
      loadError={runtime.error}
      onRun={(variables) => runs.replay(versionToRun.id, variables)}
    />}
  </>;
}

function RunsReview({ testCaseId }: { testCaseId: string }) {
  const runs = useWorkflowRuns();
  return <RunsHistoryPanel testCaseId={testCaseId} refreshKey={runs.historyRevision} onSelectRun={(runId) => void runs.openRun(runId)} />;
}

function EditorLayout({ testCaseName, testCaseId, demo = false, authoringSnapshot, sourceWorkspaceKey }: { testCaseName: string; testCaseId: string; demo?: boolean; authoringSnapshot?: AuthoringSnapshot; sourceWorkspaceKey?: string }) {
  const [mode, setMode] = useState<"workflow" | "authoring" | "versions" | "runs">("workflow");
  return (
    <div className="flex h-dvh min-h-[640px] flex-col overflow-hidden bg-slate-950 text-slate-100">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-950 px-4">
        <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500 text-slate-950">
          <GitBranch aria-hidden="true" className="size-4" strokeWidth={2.5} />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400">SendKit Workflow</p>
          <h1 className="truncate text-sm font-semibold text-slate-100">{testCaseName}</h1>
        </div>
        <nav aria-label="Workflow modes" className="flex gap-1"><button type="button" aria-pressed={mode === "workflow"} onClick={() => setMode("workflow")} className="rounded px-2 py-1 text-xs">Workflow</button><button type="button" aria-pressed={mode === "authoring"} onClick={() => setMode("authoring")} className="rounded px-2 py-1 text-xs">Authoring</button><button type="button" aria-pressed={mode === "versions"} onClick={() => setMode("versions")} className="rounded px-2 py-1 text-xs">Versions</button><button type="button" aria-pressed={mode === "runs"} onClick={() => setMode("runs")} className="rounded px-2 py-1 text-xs">Runs</button></nav>
        <div className="ml-auto hidden items-center gap-2 text-xs text-slate-500 sm:flex">
          {demo && <DemoBadge />}
          <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.65)]" />
          Local worker
        </div>
      </header>

      <ReactFlowProvider>
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          <ResizablePanel minSize="30rem">
            <ResizablePanelGroup orientation="vertical">
              <ResizablePanel minSize="20rem">
                {mode === "workflow" ? <Canvas /> : mode === "authoring" ? <div className="h-full overflow-y-auto"><AuthoringReview snapshot={authoringSnapshot ?? { session: { id: "", testCaseId, requirement: "Start an authoring session from the review panel.", status: "drafting", riskLevel: "read_only", sourceStatus: "pending", diagnostics: [], createdAt: "", updatedAt: "" }, events: [] }} /></div> : mode === "versions" ? <VersionReview testCaseId={testCaseId} onRestored={() => setMode("workflow")} /> : <RunsReview testCaseId={testCaseId} />}
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel defaultSize="14rem" minSize="8rem" maxSize="50%">
                <div className="h-full overflow-y-auto">{mode === "authoring" ? (authoringSnapshot ? <AuthoringReview snapshot={authoringSnapshot} /> : <RequirementForm testCaseId={testCaseId} sourceWorkspaceKey={sourceWorkspaceKey} onStarted={() => window.location.reload()} />) : <ConsolePanel />}</div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel
            defaultSize="19rem"
            minSize="17rem"
            maxSize="34rem"
            groupResizeBehavior="preserve-pixel-size"
          >
            <RightSidebar />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ReactFlowProvider>
    </div>
  );
}

export function WorkflowShell({ testCaseId, testCaseName, initialGraph, onSave, demo, authoringSnapshot, sourceWorkspaceKey }: WorkflowShellProps) {
  return (
    <WorkflowEditorProvider initialGraph={initialGraph} onSave={onSave}>
      <WorkflowRunsProvider testCaseId={testCaseId}>
        <EditorLayout testCaseName={testCaseName} testCaseId={testCaseId} demo={demo} authoringSnapshot={authoringSnapshot} sourceWorkspaceKey={sourceWorkspaceKey} />
      </WorkflowRunsProvider>
    </WorkflowEditorProvider>
  );
}
