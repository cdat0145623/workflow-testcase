import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { WorkflowGraph } from "../model/types";
import { WorkflowRunsProvider, useWorkflowRuns } from "./workflow-runs-provider";

const originalFetch = globalThis.fetch;
const graph = { nodes: [], edges: [] } satisfies WorkflowGraph;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

function Harness() {
  const runs = useWorkflowRuns();
  return (
    <div>
      <button type="button" onClick={() => void runs.run(graph)}>Run</button>
      <button type="button" onClick={() => void runs.cancel()}>Cancel</button>
      <button type="button" onClick={() => void runs.replay("version-9")}>Replay</button>
      <button type="button" onClick={() => void runs.openRun("saved-run")}>Open saved</button>
      <output>{runs.latestRun?.status ?? "idle"}</output>
      <output data-testid="step-count">{runs.latestRun?.steps.length ?? 0}</output>
    </div>
  );
}

test("polls active runs and stops after a terminal status", async () => {
  const calls: string[] = [];
  const statuses: Array<"running" | "passed"> = ["running", "passed"];
  globalThis.fetch = (async (input) => {
    const url = String(input);
    calls.push(url);
    if (url === "/api/runs") {
      return Response.json({ runId: "run-1", status: "queued", workflowVersionId: "version-1" }, { status: 202 });
    }
    const status = statuses.shift() ?? "passed";
    return Response.json({ id: "run-1", workflowVersionId: "version-1", status, createdAt: new Date().toISOString(), steps: [] });
  }) as typeof fetch;

  render(
    <WorkflowRunsProvider testCaseId="case-1" pollIntervalMs={5}>
      <Harness />
    </WorkflowRunsProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Run" }));
  await screen.findByText("passed");
  const callsAtPass = calls.length;
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(calls).toHaveLength(callsAtPass);
  expect(calls.filter((url) => url === "/api/runs/run-1")).toHaveLength(2);
});

test("stops polling after an unrecoverable response", async () => {
  let calls = 0;
  globalThis.fetch = (async (input) => {
    calls += 1;
    if (String(input) === "/api/runs") return Response.json({ runId: "run-missing", status: "queued", workflowVersionId: "version-1" }, { status: 202 });
    return Response.json({ error: "Run not found" }, { status: 404 });
  }) as typeof fetch;
  render(
    <WorkflowRunsProvider testCaseId="case-1" pollIntervalMs={5}>
      <Harness />
    </WorkflowRunsProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Run" }));
  await waitFor(() => expect(screen.getByText("queued")).toBeTruthy());
  await new Promise((resolve) => setTimeout(resolve, 15));
  expect(screen.getByText("queued")).toBeTruthy();
  const stoppedAt = calls;
  await new Promise((resolve) => setTimeout(resolve, 15));
  expect(calls).toBe(stoppedAt);
});

test("preserves known steps when the cancel response omits them", async () => {
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url === "/api/runs") {
      return Response.json({ runId: "run-1", status: "queued", workflowVersionId: "version-1" }, { status: 202 });
    }
    if (url.endsWith("/cancel") && init?.method === "POST") {
      return Response.json({ id: "run-1", workflowVersionId: "version-1", status: "cancelled", createdAt: new Date().toISOString() });
    }
    return Response.json({
      id: "run-1",
      workflowVersionId: "version-1",
      status: "running",
      createdAt: new Date().toISOString(),
      steps: [{ id: "step-1", nodeId: "node-1", status: "passed", startedAt: new Date().toISOString() }],
    });
  }) as typeof fetch;

  render(
    <WorkflowRunsProvider testCaseId="case-1" pollIntervalMs={5}>
      <Harness />
    </WorkflowRunsProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Run" }));
  await screen.findByText("running");
  expect(screen.getByTestId("step-count").textContent).toBe("1");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await screen.findByText("cancelled");
  expect(screen.getByTestId("step-count").textContent).toBe("1");
});

test("loads a persisted run into the existing console without polling it again", async () => {
  globalThis.fetch = (async (input) => {
    expect(String(input)).toBe("/api/runs/saved-run");
    return Response.json({ id: "saved-run", workflowVersionId: "version-4", status: "failed", createdAt: new Date().toISOString(), steps: [] });
  }) as typeof fetch;
  render(<WorkflowRunsProvider testCaseId="case-1"><Harness /></WorkflowRunsProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Open saved" }));
  expect(await screen.findByText("failed")).toBeTruthy();
});

test("replays an immutable version through its version-scoped endpoint", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (input) => {
    calls.push(String(input));
    if (String(input).includes("/workflow-versions/")) return Response.json({ runId: "replay-run", status: "queued", workflowVersionId: "version-9" }, { status: 202 });
    return Response.json({ id: "replay-run", workflowVersionId: "version-9", status: "passed", createdAt: new Date().toISOString(), steps: [] });
  }) as typeof fetch;
  render(<WorkflowRunsProvider testCaseId="case-1" pollIntervalMs={5}><Harness /></WorkflowRunsProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Replay" }));
  await screen.findByText("passed");
  expect(calls[0]).toBe("/api/workflow-versions/version-9/runs");
});
