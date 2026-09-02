import { access } from "node:fs/promises";
import { join } from "node:path";

import { startLoginFixture } from "../fixtures/login-server";

const workerUrl = process.env.WORKER_URL ?? "http://workflow-worker:8787";
const artifactsRoot = process.env.ARTIFACTS_ROOT ?? "/artifacts";
const fixtureHost = process.env.FIXTURE_HOST ?? "0.0.0.0";
const fixturePort = Number(process.env.FIXTURE_PORT ?? "3001");

type Run = { id: string; status: string; steps: Array<{ stepId: string; status: string; error?: string }> };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Acceptance assertion failed: ${message}`);
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${workerUrl}${path}`, options);
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(`${options?.method ?? "GET"} ${path} failed (${response.status}): ${body.error ?? JSON.stringify(body)}`);
  return body;
}

async function waitForWorker(): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const health = await request<{ status: string }>("/health");
      if (health.status === "ok") return;
    } catch {
      // The worker may still be applying migrations.
    }
    await Bun.sleep(200);
  }
  throw new Error("Workflow worker did not become healthy within 30 seconds");
}

function loginWorkflow(workflowVersionId: string, overrides: Record<string, unknown> = {}) {
  return {
    workflowVersionId,
    steps: [
      { id: "open-login", type: "open_url", url: "{{baseUrl}}/login" },
      { id: "fill-email", type: "fill", locator: { strategy: "test_id", value: "email" }, value: "{{email}}" },
      { id: "fill-password", type: "fill", locator: { strategy: "test_id", value: "password" }, value: "{{password}}" },
      { id: "submit-login", type: "click", locator: { strategy: "test_id", value: "login" } },
      { id: "dashboard-visible", type: "expect_visible", locator: { strategy: "test_id", value: "dashboard" } },
      { id: "capture-dashboard", type: "screenshot", fullPage: true },
    ],
    ...overrides,
  };
}

async function startRun(baseUrl: string, workflow: ReturnType<typeof loginWorkflow>) {
  return request<{ runId: string; status: string }>("/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ baseUrl, variables: { email: "acceptance@example.com", password: "not-stored" }, workflow }),
  });
}

async function waitForRun(runId: string, statuses: string[] = ["passed", "failed", "cancelled"]): Promise<Run> {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const run = await request<Run>(`/runs/${runId}`);
    if (statuses.includes(run.status)) return run;
    await Bun.sleep(150);
  }
  throw new Error(`Run ${runId} did not reach ${statuses.join(", ")}`);
}

async function assertArtifacts(runId: string): Promise<void> {
  for (const path of ["trace.zip", "report.html", "report.json", "run.log", "steps/open-login-before.png"]) {
    await access(join(artifactsRoot, runId, path));
  }
}

async function main(): Promise<void> {
  const { server, baseUrl } = await startLoginFixture({ host: fixtureHost, port: fixturePort });
  try {
    await waitForWorker();

    const first = await startRun(baseUrl, loginWorkflow("acceptance-login-v1"));
    const firstResult = await waitForRun(first.runId);
    assert(first.status === "queued", "POST /runs returns queued immediately");
    assert(firstResult.status === "passed", "first login replay passes");
    assert(firstResult.steps.every((step) => step.status === "passed"), "all first replay steps pass");
    await assertArtifacts(first.runId);

    const second = await startRun(baseUrl, loginWorkflow("acceptance-login-v1"));
    const secondResult = await waitForRun(second.runId);
    assert(secondResult.status === "passed", "second replay of the same workflow version passes");
    assert(second.runId !== first.runId, "replays have separate run ids");
    await assertArtifacts(second.runId);

    const failingWorkflow = loginWorkflow("acceptance-login-failure-v1", {
      steps: [
        { id: "open-login", type: "open_url", url: "{{baseUrl}}/login" },
        { id: "missing-marker", type: "expect_visible", locator: { strategy: "test_id", value: "does-not-exist" }, timeout: 250 },
        { id: "must-be-skipped", type: "screenshot", fullPage: true },
      ],
    });
    const failed = await startRun(baseUrl, failingWorkflow);
    const failedResult = await waitForRun(failed.runId);
    assert(failedResult.status === "failed", "bad locator fails the run");
    assert(failedResult.steps.find((step) => step.stepId === "missing-marker")?.status === "failed", "bad locator fails at the correct step");
    assert(failedResult.steps.find((step) => step.stepId === "must-be-skipped")?.status === "skipped", "steps after a failure are skipped");
    await assertArtifacts(failed.runId);

    const slowWorkflow = loginWorkflow("acceptance-slow-v1", { steps: [{ id: "slow-open", type: "open_url", url: "{{baseUrl}}/login?delay=1500" }] });
    const slow = await startRun(baseUrl, slowWorkflow);
    await waitForRun(slow.runId, ["running"]);
    const queued = await startRun(baseUrl, loginWorkflow("acceptance-queued-v1"));
    const queuedState = await request<Run>(`/runs/${queued.runId}`);
    assert(queuedState.status === "queued", "second run stays queued while the first run is active");
    assert((await waitForRun(slow.runId)).status === "passed", "slow run passes");
    assert((await waitForRun(queued.runId)).status === "passed", "queued run starts and passes after the active run");

    const cancellable = await startRun(baseUrl, slowWorkflow);
    await waitForRun(cancellable.runId, ["running"]);
    const cancelled = await request<{ status: string }>(`/runs/${cancellable.runId}/cancel`, { method: "POST" });
    assert(cancelled.status === "cancelled", "cancel endpoint marks the active run cancelled");
    assert((await waitForRun(cancellable.runId)).status === "cancelled", "cancelled run reaches its terminal status");

    console.log(JSON.stringify({ ok: true, runs: [first.runId, second.runId, failed.runId, slow.runId, queued.runId, cancellable.runId] }, null, 2));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

await main();
