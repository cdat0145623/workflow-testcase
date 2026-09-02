import { describe, expect, test } from "bun:test";

import type { RecordedAction, SourceBusinessRule } from "@cwa-dev/sendkit-workflow-contract";
import { compileAuthoringDraft } from "./compile-authoring-draft";

const roleLocator = { locator: { strategy: "role" as const, role: "button", name: "Save" }, verified: true, matchCount: 1 };

function action(overrides: Partial<RecordedAction>): RecordedAction {
  return {
    id: "action",
    kind: "click",
    label: "Click Save",
    locatorCandidates: [roleLocator],
    sensitive: false,
    coverageTags: [],
    artifactIds: ["evidence-1"],
    provenance: "browser",
    ...overrides,
  };
}

describe("compileAuthoringDraft", () => {
  test("creates one deterministic linear graph with explicit observed waits", () => {
    const result = compileAuthoringDraft({
      riskLevel: "read_only",
      businessRules: [],
      actions: [
        action({ id: "open-login", kind: "navigate", label: "Open login", targetUrl: "{{baseUrl}}/login", locatorCandidates: undefined }),
        action({ id: "submit-login", label: "Submit login", waitFor: { locator: { strategy: "role", role: "navigation", name: "Main" }, state: "visible" } }),
        action({ id: "verify-main", kind: "assert_visible", label: "Verify main", locatorCandidates: [{ locator: { strategy: "role", role: "navigation", name: "Main" }, verified: true, matchCount: 1 }] }),
      ],
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.graph.nodes.map((node) => node.data.type)).toEqual(["start", "open-url", "click", "wait-for", "expect-visible"]);
    expect(result.graph.nodes.map((node) => node.id)).toEqual(["start", "open-login", "submit-login", "submit-login-wait", "verify-main"]);
    expect(result.graph.edges).toHaveLength(4);
  });

  test("uses the highest-ranked unique verified locator", () => {
    const result = compileAuthoringDraft({
      riskLevel: "read_only",
      businessRules: [],
      actions: [action({
        locatorCandidates: [
          { locator: { strategy: "css", value: ".save" }, verified: true, matchCount: 1 },
          { locator: { strategy: "test_id", value: "save-task" }, verified: true, matchCount: 1 },
        ],
      })],
    });

    expect(result.graph.nodes[1]?.data.values).toMatchObject({ locatorStrategy: "test_id", locatorValue: "save-task" });
  });

  test("blocks a source-derived business rule when filter coverage is missing", () => {
    const rule: SourceBusinessRule = {
      id: "selected-user-scopes-daily-task",
      statement: "Calendar and recurring-task modal show tasks for selectedUserId.",
      evidenceIds: ["source-calendar-filter", "source-modal-filter"],
      requiredCoverageTags: ["assign-target-user", "select-target-user-filter", "verify-target-user-task"],
    };
    const result = compileAuthoringDraft({
      riskLevel: "write",
      businessRules: [rule],
      actions: [
        action({ id: "assign", coverageTags: ["assign-target-user"] }),
        action({ id: "verify", kind: "assert_visible", coverageTags: ["verify-target-user-task"] }),
      ],
    });

    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "business_rule_uncovered", severity: "blocker", ruleId: rule.id }));
  });

  test("accepts the HCNS rule only after the target employee filter is included", () => {
    const rule: SourceBusinessRule = {
      id: "selected-user-scopes-daily-task",
      statement: "Calendar and recurring-task modal show tasks for selectedUserId.",
      evidenceIds: ["source-calendar-filter", "source-modal-filter"],
      requiredCoverageTags: ["assign-target-user", "select-target-user-filter", "verify-target-user-task"],
    };
    const result = compileAuthoringDraft({
      riskLevel: "write",
      businessRules: [rule],
      actions: [
        action({ id: "assign", coverageTags: ["assign-target-user"] }),
        action({ id: "filter", kind: "select", value: "{{assignee_name}}", coverageTags: ["select-target-user-filter"] }),
        action({ id: "verify", kind: "assert_visible", coverageTags: ["verify-target-user-task"] }),
      ],
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.graph.nodes.map((node) => node.id)).toEqual(["start", "assign", "filter", "verify"]);
  });
});
