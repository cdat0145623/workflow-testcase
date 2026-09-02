"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";

import type { WorkflowGraph } from "../model/types";
import type { WorkerRun } from "./types";

const terminalStatuses = new Set(["passed", "failed", "cancelled"]);

interface RunsContextValue {
  activeRun: WorkerRun | null;
  latestRun: WorkerRun | null;
  error: string | null;
  run(graph: WorkflowGraph, variables?: Record<string, string>): Promise<void>;
  cancel(): Promise<void>;
  replay(workflowVersionId: string, variables?: Record<string, string>): Promise<void>;
}

const RunsContext = createContext<RunsContextValue | null>(null);

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

export function WorkflowRunsProvider({ testCaseId, pollIntervalMs = 1_000, initialRun = null, children }: PropsWithChildren<{ testCaseId: string; pollIntervalMs?: number; initialRun?: WorkerRun | null }>) {
  const [runId, setRunId] = useState<string | null>(null);
  const [latestRun, setLatestRun] = useState<WorkerRun | null>(initialRun);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRunIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!runId) return;
    let disposed = false;
    const poll = async () => {
      try {
        const run = await jsonRequest<WorkerRun>(`/api/runs/${encodeURIComponent(runId)}`);
        if (disposed || cancelledRunIdsRef.current.has(runId)) return;
        setLatestRun(run);
        if (terminalStatuses.has(run.status)) setRunId(null);
        else timerRef.current = setTimeout(poll, pollIntervalMs);
      } catch (pollError) {
        if (!disposed) {
          setError(pollError instanceof Error ? pollError.message : String(pollError));
          setRunId(null);
        }
      }
    };
    timerRef.current = setTimeout(poll, pollIntervalMs);
    return () => {
      disposed = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pollIntervalMs, runId]);

  const queue = useCallback(async (body: unknown) => {
    setError(null);
    try {
      const queued = await jsonRequest<{ runId: string; status: "queued"; workflowVersionId: string }>("/api/runs", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setLatestRun({ id: queued.runId, workflowVersionId: queued.workflowVersionId, status: "queued", createdAt: new Date().toISOString(), steps: [] });
      setRunId(queued.runId);
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : String(queueError));
      throw queueError;
    }
  }, []);

  const value = useMemo<RunsContextValue>(() => ({
    activeRun: runId && latestRun ? latestRun : null,
    latestRun,
    error,
    run: (graph, variables = {}) => queue({ action: "start", testCaseId, graph, variables }),
    replay: (workflowVersionId, variables = {}) => queue({ action: "replay", workflowVersionId, variables }),
    cancel: async () => {
      if (!runId) return;
      try {
        const cancelled = await jsonRequest<Partial<WorkerRun> & Pick<WorkerRun, "id" | "status">>(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST" });
        cancelledRunIdsRef.current.add(runId);
        setLatestRun((current) => ({
          ...current,
          ...cancelled,
          id: cancelled.id,
          status: cancelled.status,
          workflowVersionId: cancelled.workflowVersionId ?? current?.workflowVersionId ?? "",
          createdAt: cancelled.createdAt ?? current?.createdAt ?? new Date().toISOString(),
          steps: cancelled.steps ?? current?.steps ?? [],
        }));
        setRunId(null);
      } catch (cancelError) {
        setError(cancelError instanceof Error ? cancelError.message : String(cancelError));
        throw cancelError;
      }
    },
  }), [error, latestRun, queue, runId, testCaseId]);

  return <RunsContext.Provider value={value}>{children}</RunsContext.Provider>;
}

export function useWorkflowRuns(): RunsContextValue {
  const value = useContext(RunsContext);
  if (!value) throw new Error("useWorkflowRuns must be used inside WorkflowRunsProvider");
  return value;
}
