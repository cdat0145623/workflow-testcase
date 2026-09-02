import { z } from "zod";

import { locatorSchema, type Locator } from "./workflow";

export const authoringSessionStatusSchema = z.enum([
  "drafting",
  "source_review",
  "browser_discovery",
  "needs_review",
  "approved",
  "rejected",
  "failed",
  "cancelled",
]);
export const authoringSourceStatusSchema = z.enum(["pending", "complete", "unavailable"]);
export const authoringRiskLevelSchema = z.enum(["read_only", "write", "destructive"]);
export const authoringProvenanceSchema = z.enum(["source", "browser", "agent"]);

const identifierSchema = z.string().min(1).max(160).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/);
const coverageTagSchema = z.string().min(1).max(120).regex(/^[a-z][a-z0-9-]*$/);
const secretPlaceholder = /^\{\{secret\.[a-z][a-z0-9_]*\}\}$/;
const secretLikeLiteral = /(?:^bearer\s+|(?:password|passwd|token|api[_-]?key|cookie|authorization)\s*[=:])/i;

function isSafeRelativePath(value: string): boolean {
  return value.length > 0
    && !value.startsWith("/")
    && !value.startsWith("\\")
    && !/^[a-zA-Z]:[\\/]/.test(value)
    && value.split(/[\\/]+/).every((part) => part !== ".." && part.length > 0);
}

export const sourceEvidenceSchema = z.object({
  id: identifierSchema,
  workspaceKey: identifierSchema,
  relativePath: z.string().min(1).max(500).refine(isSafeRelativePath, "relativePath must stay within the configured workspace"),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  symbol: z.string().min(1).max(300).optional(),
  finding: z.string().min(1).max(2_000),
  excerpt: z.string().min(1).max(1_000).optional(),
  provenance: z.literal("source"),
}).strict().refine((value) => value.endLine >= value.startLine, {
  message: "endLine must be greater than or equal to startLine",
  path: ["endLine"],
});

export const sourceBusinessRuleSchema = z.object({
  id: identifierSchema,
  statement: z.string().min(1).max(2_000),
  evidenceIds: z.array(identifierSchema).min(1).max(50),
  requiredCoverageTags: z.array(coverageTagSchema).min(1).max(50),
}).strict();

export const authoringTestPlanSchema = z.object({
  scope: z.string().min(1).max(2_000),
  expectedOutcomes: z.array(z.string().min(1).max(1_000)).min(1).max(50),
  excludedScenarios: z.array(z.string().min(1).max(1_000)).max(50).default([]),
  businessRules: z.array(sourceBusinessRuleSchema).max(50).default([]),
  riskLevel: authoringRiskLevelSchema,
}).strict();

export const locatorCandidateSchema = z.object({
  locator: locatorSchema,
  verified: z.boolean(),
  matchCount: z.number().int().nonnegative(),
}).strict();

export const recordedActionSchema = z.object({
  id: identifierSchema,
  kind: z.enum(["navigate", "click", "fill", "select", "wait", "assert_visible", "assert_text", "screenshot"]),
  label: z.string().min(1).max(500),
  locatorCandidates: z.array(locatorCandidateSchema).min(1).max(20).optional(),
  value: z.string().min(1).max(2_000).optional(),
  sensitive: z.boolean().default(false),
  targetUrl: z.string().url().max(2_000).optional(),
  waitFor: z.object({
    locator: locatorSchema,
    state: z.enum(["attached", "visible"]),
  }).strict().optional(),
  coverageTags: z.array(coverageTagSchema).max(50),
  artifactIds: z.array(identifierSchema).max(50),
  provenance: z.enum(["browser", "agent"]),
}).strict().superRefine((action, context) => {
  if (action.sensitive && (!action.value || !secretPlaceholder.test(action.value))) {
    context.addIssue({ code: "custom", path: ["value"], message: "Secret-like literal values are not allowed" });
  }
  if (!action.sensitive && action.value && secretLikeLiteral.test(action.value)) {
    context.addIssue({ code: "custom", path: ["value"], message: "Secret-like literal values are not allowed" });
  }
  if (action.kind === "navigate" && !action.targetUrl) {
    context.addIssue({ code: "custom", path: ["targetUrl"], message: "navigate actions require targetUrl" });
  }
  if (["click", "fill", "select", "wait", "assert_visible", "assert_text"].includes(action.kind) && !action.locatorCandidates?.length && !action.waitFor) {
    context.addIssue({ code: "custom", path: ["locatorCandidates"], message: "This action requires a locator candidate" });
  }
});

export const authoringDecisionSchema = z.object({
  id: identifierSchema,
  decision: z.string().min(1).max(2_000),
  because: z.string().min(1).max(2_000),
  evidenceIds: z.array(identifierSchema).min(1).max(50),
  confidence: z.number().min(0).max(1),
  provenance: z.literal("agent"),
}).strict();

export const authoringDiagnosticSchema = z.object({
  code: z.enum([
    "source_incomplete",
    "source_unavailable",
    "locator_unverified",
    "business_rule_uncovered",
    "write_action_unverified",
    "graph_invalid",
    "secret_value_rejected",
  ]),
  severity: z.enum(["blocker", "warning"]),
  message: z.string().min(1).max(2_000),
  actionId: identifierSchema.optional(),
  ruleId: identifierSchema.optional(),
}).strict();

export const authoringArtifactReferenceSchema = z.object({
  id: identifierSchema,
  mimeType: z.enum(["image/png", "image/jpeg"]),
  relativePath: z.string().min(1).max(500).refine(isSafeRelativePath, "relativePath must be safe"),
  label: z.string().min(1).max(300),
}).strict();

export const authoringEventInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("source_evidence_added"), payload: sourceEvidenceSchema }).strict(),
  z.object({ kind: z.literal("business_rule_added"), payload: sourceBusinessRuleSchema }).strict(),
  z.object({ kind: z.literal("test_plan_set"), payload: authoringTestPlanSchema }).strict(),
  z.object({ kind: z.literal("action_recorded"), payload: recordedActionSchema }).strict(),
  z.object({ kind: z.literal("decision_recorded"), payload: authoringDecisionSchema }).strict(),
  z.object({ kind: z.literal("artifact_attached"), payload: authoringArtifactReferenceSchema }).strict(),
  z.object({ kind: z.literal("source_unavailable"), payload: z.object({ reason: z.string().min(1).max(2_000) }).strict() }).strict(),
  z.object({ kind: z.literal("source_analysis_completed"), payload: z.object({ summary: z.string().min(1).max(2_000) }).strict() }).strict(),
  z.object({ kind: z.literal("status_changed"), payload: z.object({ from: authoringSessionStatusSchema, to: authoringSessionStatusSchema }).strict() }).strict(),
  z.object({ kind: z.literal("draft_compiled"), payload: z.object({ summary: z.string().min(1).max(2_000) }).strict() }).strict(),
  z.object({ kind: z.literal("approved"), payload: z.object({ workflowVersionId: z.string().min(1).max(300) }).strict() }).strict(),
  z.object({ kind: z.literal("rejected"), payload: z.object({ reason: z.string().min(1).max(2_000) }).strict() }).strict(),
]);

export const authoringCompileResultSchema = z.object({
  diagnostics: z.array(authoringDiagnosticSchema),
  graph: z.unknown().optional(),
  decisions: z.array(authoringDecisionSchema),
}).strict();

export type AuthoringSessionStatus = z.infer<typeof authoringSessionStatusSchema>;
export type AuthoringSourceStatus = z.infer<typeof authoringSourceStatusSchema>;
export type AuthoringRiskLevel = z.infer<typeof authoringRiskLevelSchema>;
export type AuthoringProvenance = z.infer<typeof authoringProvenanceSchema>;
export type SourceEvidence = z.infer<typeof sourceEvidenceSchema>;
export type SourceBusinessRule = z.infer<typeof sourceBusinessRuleSchema>;
export type AuthoringTestPlan = z.infer<typeof authoringTestPlanSchema>;
export type LocatorCandidate = z.infer<typeof locatorCandidateSchema>;
export type RecordedAction = z.infer<typeof recordedActionSchema>;
export type AuthoringDecision = z.infer<typeof authoringDecisionSchema>;
export type AuthoringDiagnostic = z.infer<typeof authoringDiagnosticSchema>;
export type AuthoringArtifactReference = z.infer<typeof authoringArtifactReferenceSchema>;
export type AuthoringEventInput = z.infer<typeof authoringEventInputSchema>;
export type AuthoringCompileResult = z.infer<typeof authoringCompileResultSchema>;
export type { Locator };
