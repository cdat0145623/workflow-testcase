"use client";

import { useState, type FormEvent } from "react";

export function RequirementForm({ testCaseId, sourceWorkspaceKey, onStarted }: { testCaseId: string; sourceWorkspaceKey?: string; onStarted: () => void }) {
  const [requirement, setRequirement] = useState("");
  const [riskLevel, setRiskLevel] = useState<"read_only" | "write" | "destructive">("read_only");
  const [error, setError] = useState<string>();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!sourceWorkspaceKey) return setError("Configure a source workspace key for this project before authoring.");
    const response = await fetch("/api/authoring/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ testCaseId, requirement, riskLevel }) });
    if (!response.ok) return setError("Unable to start authoring.");
    onStarted();
  }
  return <form aria-label="Start authoring" onSubmit={submit} className="space-y-2 border-t border-slate-800 p-4">
    <p className="text-xs text-slate-400">Source workspace: {sourceWorkspaceKey ?? "not configured"}</p>
    <textarea required value={requirement} onChange={(event) => setRequirement(event.target.value)} placeholder="Short requirement" className="w-full rounded border border-slate-700 bg-slate-900 p-2 text-sm" />
    <select value={riskLevel} onChange={(event) => setRiskLevel(event.target.value as typeof riskLevel)} className="rounded border border-slate-700 bg-slate-900 p-2 text-sm"><option value="read_only">Read only</option><option value="write">Write</option><option value="destructive">Destructive</option></select>
    <button type="submit" className="ml-2 rounded bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950">Start authoring</button>
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
  </form>;
}
