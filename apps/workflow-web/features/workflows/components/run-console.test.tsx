import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { WorkerRun } from "../runs/types";
import { WorkflowRunsProvider } from "../runs/workflow-runs-provider";
import { ConsolePanel } from "./console-panel";

afterEach(cleanup);

const failedRun: WorkerRun = {
  id: "run-1",
  workflowVersionId: "version-1",
  status: "failed",
  createdAt: "2026-09-02T00:00:00.000Z",
  steps: [
    { runId: "run-1", stepId: "open", type: "open_url", status: "passed", durationMs: 120 },
    { runId: "run-1", stepId: "submit", type: "click", status: "failed", error: "Button was not visible" },
    { runId: "run-1", stepId: "dashboard", type: "expect_visible", status: "skipped" },
  ],
};

test("shows normalized run steps, exact failure and local screenshots without cloud replay", () => {
  render(
    <WorkflowRunsProvider testCaseId="case-1" initialRun={failedRun}>
      <ConsolePanel />
    </WorkflowRunsProvider>,
  );
  expect(screen.getByText("failed")).toBeTruthy();
  expect(screen.getByText("dashboard")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /submit/ }));
  expect(screen.getByText("Button was not visible")).toBeTruthy();
  expect(screen.getByAltText("submit before screenshot")).toBeTruthy();
  expect(screen.getByAltText("submit after screenshot")).toBeTruthy();
  expect(screen.queryByText(/Browserbase|Pro lock|Replay/i)).toBeNull();
});
