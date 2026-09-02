"use client";

import { useEffect, useState } from "react";

import type { RuntimeFieldDefinition } from "./types";

export function useRuntimeValues(testCaseId: string, enabled: boolean, workflowVersionId?: string) {
  const [fields, setFields] = useState<RuntimeFieldDefinition[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    const query = workflowVersionId ? `?workflowVersionId=${encodeURIComponent(workflowVersionId)}` : "";
    fetch(`/api/test-cases/${encodeURIComponent(testCaseId)}/runtime-values${query}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to load runtime values");
        return body as { fields: RuntimeFieldDefinition[]; values: Record<string, string> };
      })
      .then((body) => { if (!controller.signal.aborted) { setFields(body.fields); setValues(body.values); } })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false); });
    return () => controller.abort();
  }, [enabled, testCaseId, workflowVersionId]);

  return { fields, values, isLoading, error };
}
