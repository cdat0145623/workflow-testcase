"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";

import type { WorkflowGraph } from "../model/types";
import type { WorkerRun } from "./types";

const terminalStatuses = new Set(["passed", "failed", "cancelled"]);

interface RunsContextValue {
  testCaseId: string;
  activeRun: WorkerRun | null;
  latestRun: WorkerRun | null;
  error: string | null;
  historyRevision: number;
  run(graph: WorkflowGraph, variables?: Record<string, string>): Promise<void>;
  cancel(): Promise<void>;
  replay(workflowVersionId: string, variables?: Record<string, string>): Promise<void>;
  openRun(runId: string): Promise<void>;
}

const RunsContext = createContext<RunsContextValue | null>(null);

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = await response.json();
  if (!response.ok) {
    const error = Object.assign(new Error(body.error ?? `Request failed (${response.status})`), { fieldErrors: body.fieldErrors });
    throw error;
  }
  return body;
}

export function WorkflowRunsProvider({ testCaseId, pollIntervalMs = 1_000, initialRun = null, children }: PropsWithChildren<{ testCaseId: string; pollIntervalMs?: number; initialRun?: WorkerRun | null }>) {
  const [runId, setRunId] = useState<string | null>(null);
  const [latestRun, setLatestRun] = useState<WorkerRun | null>(initialRun);
  const [error, setError] = useState<string | null>(null);
  const [historyRevision, setHistoryRevision] = useState(0);
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
        if (terminalStatuses.has(run.status)) { setRunId(null); setHistoryRevision((current) => current + 1); }
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

  const queue = useCallback(async (body: unknown, url = "/api/runs") => {
    setError(null);
    try {
      const queued = await jsonRequest<{ runId: string; status: "queued"; workflowVersionId: string }>(url, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setLatestRun({ id: queued.runId, workflowVersionId: queued.workflowVersionId, status: "queued", createdAt: new Date().toISOString(), steps: [] });
      setRunId(queued.runId);
      setHistoryRevision((current) => current + 1);
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : String(queueError));
      throw queueError;
    }
  }, []);

  const value = useMemo<RunsContextValue>(() => ({
    testCaseId,
    activeRun: runId && latestRun ? latestRun : null,
    latestRun,
    error,
    historyRevision,
    run: (graph, variables = {}) => queue({ action: "start", testCaseId, graph, variables }),
    replay: (workflowVersionId, variables = {}) => queue({ variables }, `/api/workflow-versions/${encodeURIComponent(workflowVersionId)}/runs`),
    openRun: async (savedRunId) => {
      setError(null);
      try {
        const run = await jsonRequest<WorkerRun>(`/api/runs/${encodeURIComponent(savedRunId)}`);
        setLatestRun(run);
        setRunId(null);
      } catch (openError) {
        setError(openError instanceof Error ? openError.message : String(openError));
        throw openError;
      }
    },
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
  }), [error, historyRevision, latestRun, queue, runId, testCaseId]);

  return <RunsContext.Provider value={value}>{children}</RunsContext.Provider>;
}

export function useWorkflowRuns(): RunsContextValue {
  const value = useContext(RunsContext);
  if (!value) throw new Error("useWorkflowRuns must be used inside WorkflowRunsProvider");
  return value;
}
