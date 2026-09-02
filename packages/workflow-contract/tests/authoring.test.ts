import { describe, expect, test } from "bun:test";

import {
  authoringDecisionSchema,
  authoringEventInputSchema,
  recordedActionSchema,
  sourceEvidenceSchema,
} from "../src/index";

describe("authoring contract", () => {
  test("accepts source evidence with a relative file range", () => {
    expect(
      sourceEvidenceSchema.parse({
        id: "source-calendar-filter",
        workspaceKey: "hcns",
        relativePath: "features/calendar/calendar.tsx",
        startLine: 42,
        endLine: 56,
        symbol: "filteredTasks",
        finding: "The visible tasks are scoped by selectedUserId.",
        provenance: "source",
      }),
    ).toMatchObject({ workspaceKey: "hcns", startLine: 42, endLine: 56 });
  });

  test("rejects absolute and traversing source paths", () => {
    const base = {
      id: "source-calendar-filter",
      workspaceKey: "hcns",
      startLine: 42,
      endLine: 56,
      finding: "The visible tasks are scoped by selectedUserId.",
      provenance: "source",
    };

    expect(() => sourceEvidenceSchema.parse({ ...base, relativePath: "/private/calendar.tsx" })).toThrow();
    expect(() => sourceEvidenceSchema.parse({ ...base, relativePath: "../calendar.tsx" })).toThrow();
  });

  test("accepts a secret placeholder and rejects a literal sensitive value", () => {
    const action = {
      id: "fill-password",
      kind: "fill",
      label: "Fill password",
      value: "{{secret.login_password}}",
      sensitive: true,
      locatorCandidates: [{
        locator: { strategy: "role", role: "textbox", name: "Password" },
        verified: true,
        matchCount: 1,
      }],
      coverageTags: ["login"],
      artifactIds: [],
      provenance: "browser",
    };

    expect(recordedActionSchema.parse(action)).toMatchObject({ value: "{{secret.login_password}}" });
    expect(() => recordedActionSchema.parse({ ...action, value: "plain-text-password" })).toThrow(
      "Secret-like literal values are not allowed",
    );
  });

  test("rejects secret-like literals in a non-sensitive recorded action", () => {
    expect(() => recordedActionSchema.parse({
      id: "fill-token",
      kind: "fill",
      label: "Fill token",
      value: "Bearer abcdefghijklmnopqrstuvwxyz",
      sensitive: false,
      locatorCandidates: [{
        locator: { strategy: "role", role: "textbox", name: "Token" },
        verified: true,
        matchCount: 1,
      }],
      coverageTags: [],
      artifactIds: [],
      provenance: "agent",
    })).toThrow("Secret-like literal values are not allowed");
  });

  test("requires evidence and bounded confidence for an agent decision", () => {
    const decision = {
      id: "decision-filter",
      decision: "Verify after selecting the assigned employee.",
      because: "Both visible task surfaces use selectedUserId.",
      evidenceIds: ["source-calendar-filter", "source-modal-filter"],
      confidence: 0.9,
      provenance: "agent",
    };

    expect(authoringDecisionSchema.parse(decision)).toMatchObject({ confidence: 0.9 });
    expect(() => authoringDecisionSchema.parse({ ...decision, evidenceIds: [] })).toThrow();
    expect(() => authoringDecisionSchema.parse({ ...decision, confidence: 1.1 })).toThrow();
  });

  test("rejects unknown keys in persisted authoring events", () => {
    expect(() => authoringEventInputSchema.parse({
      kind: "source_evidence_added",
      payload: {
        id: "source-calendar-filter",
        workspaceKey: "hcns",
        relativePath: "features/calendar/calendar.tsx",
        startLine: 42,
        endLine: 56,
        finding: "The visible tasks are scoped by selectedUserId.",
        provenance: "source",
      },
      unexpected: true,
    })).toThrow();
  });
});
