import {
  authoringEventInputSchema,
  type AuthoringEventInput,
  type AuthoringRiskLevel,
  type AuthoringSessionStatus,
  type AuthoringDecision,
  type RecordedAction,
  type SourceBusinessRule,
} from "@cwa-dev/sendkit-workflow-contract";

import type { AuthoringEventRecord, AuthoringRepository, AuthoringSessionRecord } from "./repository";
import { compileAuthoringDraft } from "./compiler/compile-authoring-draft";

const allowedTransitions: Record<AuthoringSessionStatus, readonly AuthoringSessionStatus[]> = {
  drafting: ["source_review", "cancelled"],
  source_review: ["browser_discovery", "failed", "cancelled"],
  browser_discovery: ["needs_review", "failed", "cancelled"],
  needs_review: ["browser_discovery", "rejected", "approved"],
  approved: [],
  rejected: [],
  failed: [],
  cancelled: [],
};

const terminalStatuses = new Set<AuthoringSessionStatus>(["approved", "rejected", "failed", "cancelled"]);
const secretLikeText = /(?:bearer\s+\S+|(?:password|passwd|token|api[_-]?key|cookie|authorization)\s*[=:]\s*\S+)/gi;

function redactText(value: string): string {
  return value.replace(secretLikeText, "[REDACTED]");
}

function requireSession(session: AuthoringSessionRecord | undefined): AuthoringSessionRecord {
  if (!session) throw new Error("Authoring session not found");
  return session;
}

export interface AuthoringServicePorts {
  repository: AuthoringRepository;
}

export interface AuthoringSnapshot {
  session: AuthoringSessionRecord;
  events: AuthoringEventRecord[];
}

export function createAuthoringService({ repository }: AuthoringServicePorts) {
  async function transitionWithAudit(session: AuthoringSessionRecord, to: AuthoringSessionStatus): Promise<AuthoringSessionRecord> {
    if (!allowedTransitions[session.status].includes(to)) throw new Error(`Illegal authoring transition: ${session.status} -> ${to}`);
    const next = await repository.transition(session.id, session.status, to);
    if (!next) throw new Error("Authoring session changed before transition could be applied");
    await repository.appendEvent(session.id, { kind: "status_changed", payload: { from: session.status, to } });
    return next;
  }

  async function activeSession(id: string): Promise<AuthoringSessionRecord> {
    const session = requireSession(await repository.getSession(id));
    if (terminalStatuses.has(session.status)) throw new Error("Authoring session is terminal and cannot be changed");
    return session;
  }

  return {
    async start({ testCaseId, requirement, riskLevel }: { testCaseId: string; requirement: string; riskLevel: AuthoringRiskLevel }) {
      const session = await repository.createSession({ testCaseId, requirement: redactText(requirement.trim()), riskLevel });
      return transitionWithAudit(session, "source_review");
    },
    async getSnapshot(id: string): Promise<AuthoringSnapshot | undefined> {
      const session = await repository.getSession(id);
      return session ? { session, events: await repository.listEvents(id) } : undefined;
    },
    async listSnapshots(testCaseId: string): Promise<AuthoringSnapshot[]> {
      return Promise.all((await repository.listSessions(testCaseId)).map(async (session) => ({ session, events: await repository.listEvents(session.id) })));
    },
    async appendEvent(id: string, input: AuthoringEventInput) {
      const session = await activeSession(id);
      const event = authoringEventInputSchema.parse(input);
      const stored = await repository.appendEvent(id, event);
      if (event.kind === "source_analysis_completed") {
        const updated = await repository.updateSourceStatus(id, "complete");
        if (!updated) throw new Error("Authoring session not found");
      }
      if (event.kind === "source_unavailable") {
        const updated = await repository.updateSourceStatus(id, "unavailable");
        if (!updated) throw new Error("Authoring session not found");
      }
      return stored;
    },
    async beginBrowserDiscovery(id: string) {
      const session = await activeSession(id);
      if (session.status !== "source_review") throw new Error("Browser discovery can only begin from source review");
      const events = await repository.listEvents(id);
      const hasEvidence = events.some((event) => event.kind === "source_evidence_added");
      const hasCompletedAnalysis = events.some((event) => event.kind === "source_analysis_completed");
      const hasUnavailableReason = events.some((event) => event.kind === "source_unavailable");
      if (session.sourceStatus === "pending" && !hasEvidence) throw new Error("Browser discovery requires source evidence");
      if (session.sourceStatus === "pending") throw new Error("Browser discovery requires source analysis completion or a source-unavailable reason");
      if (session.sourceStatus === "complete" && (!hasEvidence || !hasCompletedAnalysis)) {
        throw new Error("Browser discovery requires source evidence and source analysis completion");
      }
      if (session.sourceStatus === "unavailable" && !hasUnavailableReason) throw new Error("Browser discovery requires a source-unavailable reason");
      return transitionWithAudit(session, "browser_discovery");
    },
    async requestReview(id: string) {
      const session = await activeSession(id);
      if (session.status !== "browser_discovery") throw new Error("Review can only be requested after browser discovery");
      const events = await repository.listEvents(id);
      if (!events.some((event) => event.kind === "action_recorded")) throw new Error("Review requires at least one recorded browser action");
      return transitionWithAudit(session, "needs_review");
    },
    async compile(id: string) {
      const session = await activeSession(id);
      const events = await repository.listEvents(id);
      const businessRules = events.flatMap((event) => event.kind === "business_rule_added" ? [event.payload as SourceBusinessRule] : []);
      const actions = events.flatMap((event) => event.kind === "action_recorded" ? [event.payload as RecordedAction] : []);
      const decisions = events.flatMap((event) => event.kind === "decision_recorded" ? [event.payload as AuthoringDecision] : []);
      const result = compileAuthoringDraft({
        riskLevel: session.riskLevel,
        businessRules,
        actions,
        decisions,
      });
      const saved = await repository.saveCompiledDraft(id, result.graph, result.diagnostics);
      if (!saved) throw new Error("Authoring session not found");
      await repository.appendEvent(id, { kind: "draft_compiled", payload: { summary: `${result.graph.nodes.length - 1} deterministic steps, ${result.diagnostics.length} diagnostics.` } });
      return result;
    },
    async reject(id: string, reason: string) {
      const session = await activeSession(id);
      if (session.status !== "needs_review") throw new Error("Only a session awaiting review can be rejected");
      const next = await transitionWithAudit(session, "rejected");
      await repository.appendEvent(id, { kind: "rejected", payload: { reason: redactText(reason.trim()) } });
      return next;
    },
    async cancel(id: string) {
      const session = await activeSession(id);
      return transitionWithAudit(session, "cancelled");
    },
  };
}
