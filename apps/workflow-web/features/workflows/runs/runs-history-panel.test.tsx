import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { RunsHistoryPanel } from "./runs-history-panel";

afterEach(cleanup);

test("loads persisted run history and opens the selected run", async () => {
  const originalFetch = globalThis.fetch;
  const selected: string[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL) => new Response(JSON.stringify([
    { id: "run-2", workflowVersionId: "version-2", versionNumber: 2, status: "failed", error: "bad selector", failedStep: { stepId: "verify", title: "Verify daily task", error: "bad selector" }, createdAt: "2026-09-02T12:00:00.000Z" },
  ]))) as typeof fetch;
  try {
    render(<RunsHistoryPanel testCaseId="case-1" onSelectRun={(runId) => selected.push(runId)} />);
    expect(await screen.findByRole("button", { name: /Run run-2/ })).toBeTruthy();
    expect(screen.getByText("v2")).toBeTruthy();
    expect(screen.getByText("Verify daily task: bad selector")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Run run-2/ }));
    expect(selected).toEqual(["run-2"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
