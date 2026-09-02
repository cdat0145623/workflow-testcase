import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { VersionsPanel } from "./versions-panel";

afterEach(cleanup);

const version = {
  id: "version-2",
  testCaseId: "case-1",
  versionNumber: 2,
  createdAt: "2026-09-02T12:00:00.000Z",
  stepCount: 3,
  latestRun: { id: "run-2", status: "passed", createdAt: "2026-09-02T12:02:00.000Z" },
};

test("shows immutable version summaries and restores only the selected version graph", async () => {
  const originalFetch = globalThis.fetch;
  const restored: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    if (String(url).endsWith("/versions")) return new Response(JSON.stringify([version]));
    return new Response(JSON.stringify({ ...version, graph: { nodes: [], edges: [] }, workflow: { workflowVersionId: "version-2", steps: [] } }));
  }) as typeof fetch;
  try {
    render(<VersionsPanel testCaseId="case-1" onRestore={(detail) => restored.push(detail.id)} onRun={() => undefined} />);
    expect(await screen.findByRole("button", { name: "View v2" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View v2" }));
    expect(await screen.findByText("Version v2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Restore v2 as draft" }));
    expect(restored).toEqual(["version-2"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
