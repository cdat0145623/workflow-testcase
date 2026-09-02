import { expect, test } from "bun:test";

import { compileAuthoringDraft } from "@/features/authoring/compiler/compile-authoring-draft";
import { hcnsAuthoringFixture } from "./hcns-authoring";

const locator = { locator: { strategy: "test_id" as const, value: "employee-filter" }, verified: true, matchCount: 1 };

test("HCNS authoring fixture blocks a draft until selectedUserId filter is covered", () => {
  const base = { id: "assign-target-user", kind: "select" as const, label: "Assign target employee", locatorCandidates: [locator], value: "{{assignee_name}}", sensitive: false, coverageTags: ["assign-target-user"], artifactIds: ["before"], provenance: "browser" as const };
  const incomplete = compileAuthoringDraft({ riskLevel: "write", businessRules: [hcnsAuthoringFixture.rule], actions: [base] });
  expect(incomplete.diagnostics.some((item) => item.code === "business_rule_uncovered")).toBe(true);

  const covered = compileAuthoringDraft({ riskLevel: "write", businessRules: [hcnsAuthoringFixture.rule], actions: [
    base,
    { id: "select-target-user-filter", kind: "select", label: "Select target employee filter", locatorCandidates: [locator], value: "{{assignee_name}}", sensitive: false, coverageTags: ["select-target-user-filter"], artifactIds: ["filter"], provenance: "browser" },
    { id: "verify-target-user-task", kind: "assert_visible", label: "Verify task", locatorCandidates: [{ locator: { strategy: "test_id", value: "daily-task" }, verified: true, matchCount: 1 }], sensitive: false, coverageTags: ["verify-target-user-task"], artifactIds: [], provenance: "browser" },
  ] });
  expect(covered.diagnostics.filter((item) => item.severity === "blocker")).toHaveLength(0);
});
