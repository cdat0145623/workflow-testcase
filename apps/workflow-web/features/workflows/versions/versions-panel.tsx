"use client";

import { useEffect, useState } from "react";
import { Eye, History, Play, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { VersionGraphViewer } from "./version-graph-viewer";
import type { WorkflowVersionDetail, WorkflowVersionSummary } from "./types";

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

export function VersionsPanel({ testCaseId, onRestore, onRun }: { testCaseId: string; onRestore(detail: WorkflowVersionDetail): void; onRun(detail: WorkflowVersionDetail): void }) {
  const [versions, setVersions] = useState<WorkflowVersionSummary[]>([]);
  const [selected, setSelected] = useState<WorkflowVersionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    void requestJson<WorkflowVersionSummary[]>(`/api/test-cases/${encodeURIComponent(testCaseId)}/versions`)
      .then((next) => { if (!disposed) setVersions(next); })
      .catch((reason) => { if (!disposed) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { disposed = true; };
  }, [testCaseId]);

  const view = async (version: WorkflowVersionSummary) => {
    setError(null);
    try {
      setSelected(await requestJson<WorkflowVersionDetail>(`/api/workflow-versions/${encodeURIComponent(version.id)}`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return (
    <section aria-label="Workflow versions" className="h-full overflow-y-auto p-4">
      <div className="mb-4 flex items-center gap-2"><History className="size-4 text-emerald-400" /><div><h2 className="text-sm font-semibold">Versions</h2><p className="text-xs text-slate-500">Immutable snapshots created by Run.</p></div></div>
      {error && <p role="alert" className="mb-3 rounded border border-red-900 bg-red-950/30 p-3 text-xs text-red-200">{error}</p>}
      {versions.length === 0 ? <p className="text-sm text-slate-500">No immutable version yet. Run the saved draft to create v1.</p> : <div className="space-y-2">
        {versions.map((version) => <article key={version.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <div className="flex items-start gap-3"><div className="rounded bg-slate-800 px-2 py-1 font-mono text-xs text-emerald-300">v{version.versionNumber}</div><div className="min-w-0 flex-1"><p className="text-sm font-medium">{version.stepCount} steps</p><p className="text-xs text-slate-500">{new Date(version.createdAt).toLocaleString()}</p>{version.latestRun && <p className="mt-1 text-xs text-slate-400">Latest run: <span className="capitalize">{version.latestRun.status}</span></p>}</div><Button variant="ghost" size="sm" onClick={() => void view(version)} aria-label={`View v${version.versionNumber}`}><Eye className="size-4" /></Button></div>
        </article>)}
      </div>}
      {selected && <div className="mt-5 space-y-3 border-t border-slate-800 pt-5"><div><p className="text-sm font-semibold">Version v{selected.versionNumber}</p><p className="text-xs text-slate-500">Read-only snapshot. Restore copies it into the editable draft; it never changes this version.</p></div><VersionGraphViewer graph={selected.graph} /><div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" onClick={() => onRestore(selected)} aria-label={`Restore v${selected.versionNumber} as draft`}><RotateCcw className="size-3.5" /> Restore as draft</Button><Button variant="primary" size="sm" onClick={() => onRun(selected)} aria-label={`Run v${selected.versionNumber}`}><Play className="size-3.5 fill-current" /> Run exact version</Button></div></div>}
    </section>
  );
}
