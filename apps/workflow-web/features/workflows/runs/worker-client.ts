import type { QueuedRun, StartWorkerRunInput, WorkerRun } from "./types";

export interface WorkerClient {
  start(input: StartWorkerRunInput): Promise<QueuedRun>;
  get(runId: string): Promise<WorkerRun>;
  cancel(runId: string): Promise<WorkerRun>;
}

export class WorkerHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function createWorkerClient(baseUrl = process.env.WORKFLOW_WORKER_URL): WorkerClient {
  if (!baseUrl) throw new Error("WORKFLOW_WORKER_URL is required in local mode");

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(new URL(path, baseUrl), {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new WorkerHttpError(body.error ?? `Worker request failed (${response.status})`, response.status);
    return body as T;
  }

  return {
    start: (input) => request<QueuedRun>("/runs", { method: "POST", body: JSON.stringify(input) }),
    get: (runId) => request<WorkerRun>(`/runs/${encodeURIComponent(runId)}`),
    cancel: (runId) => request<WorkerRun>(`/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST" }),
  };
}
