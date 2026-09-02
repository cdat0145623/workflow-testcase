"use client";

import { useEffect, useRef, useState } from "react";
import type { WorkflowGraph } from "@/features/workflows/model/types";
import type { AuthoringSnapshot } from "../service";
import type { AuthoringArtifactReference, AuthoringDecision, AuthoringTestPlan, RecordedAction, SourceBusinessRule, SourceEvidence } from "@cwa-dev/sendkit-workflow-contract";

export function AuthoringPanel({ snapshot, onApprove }: { snapshot: AuthoringSnapshot; onApprove?: (graph: WorkflowGraph) => void }) {
  const [approvalState, setApprovalState] = useState<"idle" | "submitting" | "approved" | "failed">("idle");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string>();
  const blockers = snapshot.session.diagnostics.filter((diagnostic) => diagnostic.severity === "blocker");
  const evidence = snapshot.events.flatMap((event) => event.kind === "source_evidence_added" ? [event.payload as SourceEvidence] : []);
  const actions = snapshot.events.filter((event) => event.kind === "action_recorded");
  const decisions = snapshot.events.filter((event) => event.kind === "decision_recorded");
  const testPlan = snapshot.events.find((event) => event.kind === "test_plan_set")?.payload as AuthoringTestPlan | undefined;
  const rules = snapshot.events.flatMap((event) => event.kind === "business_rule_added" ? [event.payload as SourceBusinessRule] : []);
  const artifacts = snapshot.events.flatMap((event) => event.kind === "artifact_attached" ? [event.payload as AuthoringArtifactReference] : []);
  const [selectedArtifact, setSelectedArtifact] = useState<AuthoringArtifactReference>();
  const closeArtifactButton = useRef<HTMLButtonElement>(null);
  const approvable = snapshot.session.status === "needs_review" && snapshot.session.sourceStatus !== "pending" && blockers.length === 0;

  useEffect(() => {
    if (!selectedArtifact) return;
    closeArtifactButton.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedArtifact(undefined);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedArtifact]);

  async function approve() {
    if (!approvable) return;
    setApprovalState("submitting");
    try {
      const response = await fetch(`/api/authoring/sessions/${snapshot.session.id}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedUpdatedAt: snapshot.session.updatedAt }),
      });
      const body = await response.json() as { data?: { graph?: WorkflowGraph } };
      if (!response.ok || !body.data?.graph) throw new Error("Approval failed");
      setApprovalState("approved");
      onApprove?.(body.data.graph);
    } catch {
      setApprovalState("failed");
    }
  }
  async function reject() {
    if (!rejectReason.trim()) return setRejectError("A rejection reason is required.");
    const response = await fetch(`/api/authoring/sessions/${snapshot.session.id}/reject`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: rejectReason }) });
    if (!response.ok) return setRejectError("Unable to reject this draft.");
    window.location.reload();
  }

  return (
    <section aria-label="Authoring review" className="space-y-4 border-t border-slate-800 bg-slate-950 p-4 text-sm text-slate-200">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-400">Authoring review</p>
          <p className="mt-1 text-slate-300">{snapshot.session.requirement}</p>
        </div>
        <button type="button" disabled={!approvable || approvalState === "submitting"} onClick={approve} className="rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">
          {approvalState === "submitting" ? "Approving…" : approvalState === "approved" ? "Approved" : "Approve workflow"}
        </button>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        <section><h2 className="font-semibold text-slate-100">Source evidence</h2>{evidence.map((item) => <p key={item.id} className="mt-1 text-xs text-slate-400"><span className="mr-2 rounded bg-sky-950 px-1.5 py-0.5 text-sky-300">Source</span>{item.relativePath}:{item.startLine}-{item.endLine} — {item.finding}</p>)}</section>
        <section><h2 className="font-semibold text-slate-100">Test plan</h2>{testPlan ? <p className="mt-1 text-xs text-slate-400">{testPlan.scope} · Expected: {testPlan.expectedOutcomes.join("; ")}</p> : <p className="mt-1 text-xs text-slate-500">No test plan recorded.</p>}</section>
        <section><h2 className="font-semibold text-slate-100">Browser trace</h2>{actions.map((event) => { const action = event.payload as RecordedAction; return <p key={event.id} className="mt-1 text-xs text-slate-400"><span className="mr-2 rounded bg-violet-950 px-1.5 py-0.5 text-violet-300">Browser observed</span>{action.label}</p>; })}</section>
        <section><h2 className="font-semibold text-slate-100">Decisions</h2>{decisions.map((event) => { const decision = event.payload as AuthoringDecision; return <p key={event.id} className="mt-1 text-xs text-slate-400"><span className="mr-2 rounded bg-amber-950 px-1.5 py-0.5 text-amber-300">Agent inferred</span>{decision.decision} — {decision.because} · evidence: {decision.evidenceIds.join(", ") || "none"} · confidence: {Math.round(decision.confidence * 100)}% · impact: generated steps</p>; })}</section>
        <section><h2 className="font-semibold text-slate-100">Business coverage</h2>{rules.map((rule) => <p key={rule.id} className="mt-1 text-xs text-slate-400">{rule.statement}: {rule.requiredCoverageTags.every((tag) => actions.some((event) => (event.payload as RecordedAction).coverageTags.includes(tag))) ? "covered" : "missing coverage"}</p>)}</section>
        <section><h2 className="font-semibold text-slate-100">Evidence screenshots</h2>{artifacts.map((artifact) => <button type="button" key={artifact.id} onClick={() => setSelectedArtifact(artifact)} className="mt-1 block text-xs text-sky-300 underline">{artifact.label}</button>)}</section>
        <section><h2 className="font-semibold text-slate-100">Review gate</h2>{blockers.length === 0 ? <p className="mt-1 text-xs text-emerald-300">No compiler blockers.</p> : blockers.map((diagnostic) => <p key={`${diagnostic.code}-${diagnostic.message}`} className="mt-1 text-xs text-red-300">{diagnostic.message}</p>)}</section>
      </div>
      {snapshot.session.riskLevel !== "read_only" && <p className="rounded border border-amber-800 bg-amber-950/40 p-2 text-xs text-amber-200">This workflow can write data. Manual review is required before approval; approval still does not run it.</p>}
      {approvalState === "failed" && <p role="alert" className="text-xs text-red-300">Approval failed because the review data changed. Refresh and review the latest draft.</p>}
      {snapshot.session.status === "needs_review" && <div className="flex gap-2"><input aria-label="Reject reason" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Reason to revise" className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs" /><button type="button" onClick={reject} className="rounded border border-red-800 px-2 py-1 text-xs text-red-300">Reject</button>{rejectError && <p role="alert" className="text-xs text-red-300">{rejectError}</p>}</div>}
      {selectedArtifact && <div role="dialog" aria-modal="true" aria-label="Evidence screenshot" className="fixed inset-8 z-50 overflow-auto rounded bg-slate-950 p-4 shadow-2xl"><button ref={closeArtifactButton} type="button" onClick={() => setSelectedArtifact(undefined)} className="float-right">Close</button><img alt={selectedArtifact.label} src={`/api/authoring/artifacts/${snapshot.session.id}/${selectedArtifact.relativePath.split("/").at(-1)}`} className="mx-auto max-h-[80vh] max-w-full" /></div>}
    </section>
  );
}
