import type { AuthoringEventInput, AuthoringRiskLevel } from "@cwa-dev/sendkit-workflow-contract";

interface AuthoringErrorEnvelope {
  error?: { code?: string; message?: string };
}

export interface WorkflowAuthoringClient {
  start(input: { testCaseId: string; requirement: string; riskLevel: AuthoringRiskLevel }): Promise<unknown>;
  getStatus(sessionId: string): Promise<unknown>;
  appendEvent(sessionId: string, input: AuthoringEventInput): Promise<unknown>;
  beginBrowserDiscovery(sessionId: string): Promise<unknown>;
  requestReview(sessionId: string): Promise<unknown>;
  compile(sessionId: string): Promise<unknown>;
  uploadArtifact(sessionId: string, input: { bytes: Uint8Array; mimeType: "image/png" | "image/jpeg"; label: string }): Promise<unknown>;
}

export function createWorkflowAuthoringClient({
  baseUrl = process.env.SENDKIT_WORKFLOW_WEB_URL ?? "http://127.0.0.1:3000",
  fetch: fetchImplementation = globalThis.fetch,
}: {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
} = {}): WorkflowAuthoringClient {
  const root = baseUrl.replace(/\/$/, "");

  async function request(path: string, init?: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetchImplementation(`${root}${path}`, {
        ...init,
        headers: { "content-type": "application/json", ...init?.headers },
        signal: controller.signal,
      });
      const body = await response.json() as { data?: unknown } & AuthoringErrorEnvelope;
      if (!response.ok) throw new Error(body.error?.message ?? `Authoring API request failed (${response.status})`);
      return body.data;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    start(input) { return request("/api/authoring/sessions", { method: "POST", body: JSON.stringify(input) }); },
    getStatus(sessionId) { return request(`/api/authoring/sessions/${encodeURIComponent(sessionId)}`); },
    appendEvent(sessionId, input) { return request(`/api/authoring/sessions/${encodeURIComponent(sessionId)}/events`, { method: "POST", body: JSON.stringify(input) }); },
    beginBrowserDiscovery(sessionId) { return request(`/api/authoring/sessions/${encodeURIComponent(sessionId)}/begin-browser-discovery`, { method: "POST" }); },
    requestReview(sessionId) { return request(`/api/authoring/sessions/${encodeURIComponent(sessionId)}/request-review`, { method: "POST" }); },
    compile(sessionId) { return request(`/api/authoring/sessions/${encodeURIComponent(sessionId)}/compile`, { method: "POST" }); },
    async uploadArtifact(sessionId, input) {
      const form = new FormData();
      form.set("label", input.label);
      form.set("file", new Blob([input.bytes], { type: input.mimeType }), `evidence.${input.mimeType === "image/png" ? "png" : "jpg"}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetchImplementation(`${root}/api/authoring/sessions/${encodeURIComponent(sessionId)}/artifacts`, { method: "POST", body: form, signal: controller.signal });
        const body = await response.json() as { data?: unknown } & AuthoringErrorEnvelope;
        if (!response.ok) throw new Error(body.error?.message ?? `Authoring artifact upload failed (${response.status})`);
        return body.data;
      } finally { clearTimeout(timeout); }
    },
  };
}
