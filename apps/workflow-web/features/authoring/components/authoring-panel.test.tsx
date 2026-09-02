import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";

import { AuthoringPanel } from "./authoring-panel";

test("shows evidence provenance and prevents approval while blockers remain", () => {
  render(<AuthoringPanel
    snapshot={{
      session: { id: "session-1", requirement: "Verify the employee task.", status: "needs_review", riskLevel: "write", sourceStatus: "complete", diagnostics: [{ code: "business_rule_uncovered", severity: "blocker", message: "Missing employee filter", ruleId: "selected-user" }], createdAt: "2026-09-02T00:00:00.000Z", updatedAt: "2026-09-02T00:00:00.000Z", testCaseId: "case-1" },
      events: [
        { id: "event-1", sessionId: "session-1", sequence: 1, kind: "source_evidence_added", payload: { id: "source-1", workspaceKey: "hcns", relativePath: "features/calendar.tsx", startLine: 42, endLine: 56, finding: "selectedUserId scopes calendar tasks", provenance: "source" }, createdAt: "2026-09-02T00:00:00.000Z" },
      ],
    }}
  />);

  expect(screen.getByText("Source evidence")).toBeDefined();
  expect(screen.getByRole("button", { name: "Approve workflow" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByText("Missing employee filter")).toBeDefined();
});
