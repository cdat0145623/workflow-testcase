"use client";

import { useEffect, useState } from "react";
import { CircleCheck, CircleX, History, LoaderCircle } from "lucide-react";

import type { RunHistoryEntry } from "./types";

const icons = { passed: CircleCheck, failed: CircleX, cancelled: CircleX, queued: LoaderCircle, running: LoaderCircle } as const;

export function RunsHistoryPanel({ testCaseId, refreshKey = 0, onSelectRun }: { testCaseId: string; refreshKey?: number; onSelectRun(runId: string): void }) {
  const [runs, setRuns] = useState<RunHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    void fetch(`/api/test-cases/${encodeURIComponent(testCaseId)}/runs`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
        return body as RunHistoryEntry[];
      })
      .then((next) => { if (!disposed) setRuns(next); })
      .catch((reason) => { if (!disposed) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { disposed = true; };
  }, [refreshKey, testCaseId]);

  return (
    <section aria-label="Run history" className="h-full overflow-y-auto p-4">
      <div className="mb-4 flex items-center gap-2"><History className="size-4 text-emerald-400" /><div><h2 className="text-sm font-semibold">Runs</h2><p className="text-xs text-slate-500">Persisted executions for this test case.</p></div></div>
      {error && <p role="alert" className="mb-3 rounded border border-red-900 bg-red-950/30 p-3 text-xs text-red-200">{error}</p>}
      {runs.length === 0 ? <p className="text-sm text-slate-500">No persisted run yet.</p> : <div className="space-y-2">{runs.map((run) => {
        const Icon = icons[run.status as keyof typeof icons] ?? LoaderCircle;
        return <button key={run.id} type="button" aria-label={`Run ${run.id}`} onClick={() => onSelectRun(run.id)} className="flex w-full items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-left hover:border-slate-700 hover:bg-slate-900">
          <Icon className={`mt-0.5 size-4 ${run.status === "passed" ? "text-emerald-400" : run.status === "failed" ? "text-red-400" : "text-slate-400"}`} />
          <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="font-mono text-xs text-slate-200">{run.id}</span><span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">v{run.versionNumber}</span></span><span className="mt-1 block text-xs capitalize text-slate-500">{run.status} · {new Date(run.createdAt).toLocaleString()}</span>{run.failedStep ? <span className="mt-1 block truncate text-xs text-red-300">{run.failedStep.title}: {run.failedStep.error}</span> : run.error && <span className="mt-1 block truncate text-xs text-red-300">{run.error}</span>}</span>
        </button>;
      })}</div>}
    </section>
  );
}
