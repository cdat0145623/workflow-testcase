"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, LoaderCircle, Play, Plus, Save, Square } from "lucide-react";
import { useReactFlow } from "@xyflow/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { locatorStrategies, nodeRegistry, type NodeDefinition, type NodeType } from "../model/node-registry";
import type { WorkflowNode } from "../model/types";
import { useWorkflowRuns } from "../runs/workflow-runs-provider";
import { NodeIcon } from "./node-icon";
import { RunVariablesDialog } from "./run-variables-dialog";
import { useWorkflowEditor } from "./workflow-editor-provider";
import { extractRuntimeFields } from "../runtime-values/field-registry";
import { useRuntimeValues } from "../runtime-values/use-runtime-values";

const definitions = Object.values(nodeRegistry);

function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-y border-slate-800 bg-slate-900/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
      {children}
    </div>
  );
}

function Palette() {
  const editor = useWorkflowEditor();
  const flow = useReactFlow<WorkflowNode>();

  const add = (type: NodeType) => {
    const canvas = document.getElementById("workflow-canvas");
    const bounds = canvas?.getBoundingClientRect();
    const position = bounds
      ? flow.screenToFlowPosition({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 })
      : { x: 280, y: 120 };
    editor.addNode(type, position);
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {(["trigger", "action"] as const).map((kind) => (
        <section key={kind}>
          <PanelTitle>{kind === "trigger" ? "Trigger" : "Browser steps"}</PanelTitle>
          <div className="grid gap-1 p-2">
            {definitions
              .filter((definition) => definition.kind === kind)
              .map((definition) => {
                const type = definition.type as NodeType;
                const disabled = kind === "trigger" && editor.graph.nodes.some((node) => node.data.kind === "trigger");
                return (
                  <Button
                    key={type}
                    variant="ghost"
                    disabled={disabled}
                    aria-label={`Add ${definition.label} node`}
                    onClick={() => add(type)}
                    className="h-11 w-full justify-start px-2.5 text-xs"
                  >
                    <NodeIcon type={type} />
                    <span>{definition.label}</span>
                    <Plus aria-hidden="true" className="ml-auto size-4 text-slate-600" />
                  </Button>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}

function Field({ node, fieldKey, label, required }: { node: WorkflowNode; fieldKey: string; label: string; required?: boolean }) {
  const editor = useWorkflowEditor();
  const id = `${node.id}-${fieldKey}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label} {required && <span className="text-red-400">*</span>}
      </Label>
      <Input
        id={id}
        value={node.data.values[fieldKey] ?? ""}
        onChange={(event) => editor.updateNodeValues(node.id, { [fieldKey]: event.target.value })}
      />
    </div>
  );
}

function Inspector({ node }: { node: WorkflowNode | undefined }) {
  const editor = useWorkflowEditor();
  const definition: NodeDefinition | undefined = node ? nodeRegistry[node.data.type] : undefined;
  const nodeProblems = useMemo(
    () => (node ? editor.problems.filter((problem) => !problem.nodeId || problem.nodeId === node.id) : []),
    [editor.problems, node],
  );

  if (!node || !definition) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PanelTitle>Inspector</PanelTitle>
        <div className="p-4 text-sm leading-6 text-slate-500">Select a node on the canvas to edit its inputs.</div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <PanelTitle>Inspector</PanelTitle>
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-2.5">
          <NodeIcon type={node.data.type} />
          <div>
            <p className="text-sm font-semibold text-slate-100">{node.data.title}</p>
            <p className="text-xs text-slate-500">{definition.label}</p>
          </div>
        </div>

        {definition.fields.map((field) => (
          <Field key={field.key} node={node} fieldKey={field.key} label={field.label} required={field.required} />
        ))}

        {definition.requiresLocator && (
          <fieldset className="space-y-3 rounded-lg border border-slate-800 p-3">
            <legend className="px-1 text-xs font-medium text-slate-300">Locator</legend>
            <div className="space-y-1.5">
              <Label htmlFor={`${node.id}-locator-strategy`}>Strategy *</Label>
              <select
                id={`${node.id}-locator-strategy`}
                value={node.data.values.locatorStrategy ?? ""}
                onChange={(event) => editor.updateNodeValues(node.id, { locatorStrategy: event.target.value })}
                className="min-h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="">Choose strategy</option>
                {locatorStrategies.map((strategy) => (
                  <option key={strategy} value={strategy}>{strategy.replace("_", " ")}</option>
                ))}
              </select>
            </div>
            {node.data.values.locatorStrategy === "role" ? (
              <>
                <Field node={node} fieldKey="locatorRole" label="Role" required />
                <Field node={node} fieldKey="locatorName" label="Accessible name" />
              </>
            ) : (
              <Field node={node} fieldKey="locatorValue" label="Locator value" required />
            )}
          </fieldset>
        )}

        {node.data.type !== "start" && <Field node={node} fieldKey="timeout" label="Timeout (ms)" />}

        {nodeProblems.length > 0 && (
          <div role="alert" className="space-y-2 rounded-lg border border-amber-900/60 bg-amber-950/30 p-3">
            {nodeProblems.map((problem, index) => (
              <p key={`${problem.code}-${index}`} className="flex gap-2 text-xs leading-5 text-amber-200">
                <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                {problem.message}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function RightSidebar() {
  const editor = useWorkflowEditor();
  const runs = useWorkflowRuns();
  const [tab, setTab] = useState<"toolbar" | "editor">("toolbar");
  const [runVariablesOpen, setRunVariablesOpen] = useState(false);
  const runtime = useRuntimeValues(runs.testCaseId, runVariablesOpen);
  const selected = editor.graph.nodes.find((node) => node.id === editor.selectedNodeId);

  useEffect(() => {
    if (selected) setTab("editor");
  }, [selected]);

  return (
    <aside aria-label="Workflow tools" className="flex size-full min-w-0 flex-col bg-slate-950">
      <div className="flex min-h-16 items-center justify-between gap-2 border-b border-slate-800 px-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-200">Workflow editor</p>
          <p className="truncate text-[11px] text-slate-500">
            {editor.isDirty ? "Unsaved changes" : "All changes saved"}
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            disabled={!editor.isDirty || editor.isSaving || editor.problems.length > 0}
            onClick={() => void editor.save()}
          >
            {editor.isSaving ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : editor.isDirty ? <Save aria-hidden="true" className="size-4" /> : <Check aria-hidden="true" className="size-4" />}
            <span className="sr-only">Save</span>
          </Button>
          {runs.activeRun ? (
            <Button variant="danger" size="sm" onClick={() => void runs.cancel()}>
              <Square aria-hidden="true" className="size-3.5 fill-current" /> Stop
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabled={editor.problems.length > 0}
              onClick={() => setRunVariablesOpen(true)}
            >
              <Play aria-hidden="true" className="size-3.5 fill-current" /> Run
            </Button>
          )}
        </div>
      </div>

      <div role="tablist" aria-label="Workflow sidebar" className="grid grid-cols-2 gap-1 border-b border-slate-800 p-2">
        {(["toolbar", "editor"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className="min-h-10 cursor-pointer rounded-md px-3 text-xs font-medium capitalize text-slate-500 outline-none transition-colors hover:bg-slate-900 hover:text-slate-200 focus-visible:ring-2 focus-visible:ring-sky-500 aria-selected:bg-slate-800 aria-selected:text-white"
          >
            {value}
          </button>
        ))}
      </div>

      {editor.saveError && <p role="alert" className="border-b border-red-900 bg-red-950/50 px-3 py-2 text-xs text-red-200">{editor.saveError}</p>}
      {editor.restoredFromVersion != null && <p className="border-b border-amber-900/70 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">Restored v{editor.restoredFromVersion} is a draft. Save it explicitly; the immutable version is unchanged.</p>}
      {runs.error && <p role="alert" className="border-b border-red-900 bg-red-950/50 px-3 py-2 text-xs text-red-200">{runs.error}</p>}
      {tab === "toolbar" ? <Palette /> : <Inspector node={selected} />}
      <RunVariablesDialog
        open={runVariablesOpen}
        onOpenChange={setRunVariablesOpen}
        fields={runtime.fields.length > 0 ? runtime.fields : extractRuntimeFields(editor.graph)}
        initialValues={runtime.values}
        isLoading={runtime.isLoading}
        loadError={runtime.error}
        onRun={(variables) => runs.run(editor.getGraph(), variables)}
      />
    </aside>
  );
}
