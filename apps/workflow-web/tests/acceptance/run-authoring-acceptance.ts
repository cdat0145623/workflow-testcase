import pg from "pg";
import { approveAuthoringSession } from "@/features/authoring/approval-service";
import { createCatalogRepository } from "@/features/catalog/repository";
import { createAuthoringRepository } from "@/features/authoring/repository";
import { createAuthoringService } from "@/features/authoring/service";
import { createWorkerClient } from "@/features/workflows/runs/worker-client";
import { startLoginFixture } from "../fixtures/login-server";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const catalog = createCatalogRepository(pool);
const authoring = createAuthoringService({ repository: createAuthoringRepository(pool) });
const worker = createWorkerClient(process.env.WORKER_URL);
const sleep = (ms: number) => Bun.sleep(ms);
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

async function wait(runId: string) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const run = await worker.get(runId);
    if (["passed", "failed", "cancelled"].includes(run.status)) return run;
    await sleep(150);
  }
  throw new Error("Replay timed out");
}

const graph = {
  nodes: [
    { id: "start", type: "step", position: { x: 0, y: 0 }, data: { type: "start", kind: "trigger", title: "Start", values: {} } },
    { id: "open", type: "step", position: { x: 300, y: 0 }, data: { type: "open-url", kind: "action", title: "Open login", values: { url: "{{baseUrl}}/login" } } },
    { id: "email", type: "step", position: { x: 600, y: 0 }, data: { type: "fill", kind: "action", title: "Fill email", values: { locatorStrategy: "test_id", locatorValue: "email", value: "{{username}}" } } },
    { id: "password", type: "step", position: { x: 900, y: 0 }, data: { type: "fill", kind: "action", title: "Fill password", values: { locatorStrategy: "test_id", locatorValue: "password", value: "{{secret.login_password}}" } } },
    { id: "login", type: "step", position: { x: 1200, y: 0 }, data: { type: "click", kind: "action", title: "Login", values: { locatorStrategy: "test_id", locatorValue: "login" } } },
    { id: "verify", type: "step", position: { x: 1500, y: 0 }, data: { type: "expect-visible", kind: "action", title: "Dashboard visible", values: { locatorStrategy: "test_id", locatorValue: "dashboard" } } },
  ],
  edges: ["open", "email", "password", "login", "verify"].map((target, index) => ({ id: `e-${target}`, source: index === 0 ? "start" : ["open", "email", "password", "login"][index - 1]!, target })),
};

const fixture = await startLoginFixture({ host: process.env.FIXTURE_HOST ?? "0.0.0.0", port: Number(process.env.FIXTURE_PORT ?? 3002), publicHost: process.env.FIXTURE_PUBLIC_HOST ?? "workflow-authoring-acceptance" });
let projectId = "";
try {
  const project = await catalog.createProject(`Authoring acceptance ${crypto.randomUUID()}`); projectId = project.id;
  const feature = await catalog.createFeature(project.id, "HCNS");
  const testCase = await catalog.createTestCase(feature.id, { name: "Sanitized login replay", baseUrl: fixture.baseUrl });
  const session = await authoring.start({ testCaseId: testCase.id, requirement: "Source-first sanitized HCNS replay", riskLevel: "read_only" });
  await authoring.appendEvent(session.id, { kind: "source_evidence_added", payload: { id: "source-login", workspaceKey: "hcns", relativePath: "login.tsx", startLine: 1, endLine: 2, finding: "Login fields are required.", provenance: "source" } });
  await authoring.appendEvent(session.id, { kind: "source_analysis_completed", payload: { summary: "Sanitized source reviewed." } });
  await authoring.beginBrowserDiscovery(session.id);
  for (const action of [
    { id: "open", kind: "navigate", label: "Open login", targetUrl: `${fixture.baseUrl}/login` },
    { id: "email", kind: "fill", label: "Fill email", value: "{{username}}", locatorCandidates: [{ locator: { strategy: "test_id", value: "email" }, verified: true, matchCount: 1 }] },
    { id: "password", kind: "fill", label: "Fill password", value: "{{secret.login_password}}", sensitive: true, locatorCandidates: [{ locator: { strategy: "test_id", value: "password" }, verified: true, matchCount: 1 }] },
    { id: "login", kind: "click", label: "Login", locatorCandidates: [{ locator: { strategy: "test_id", value: "login" }, verified: true, matchCount: 1 }] },
    { id: "verify", kind: "assert_visible", label: "Dashboard visible", locatorCandidates: [{ locator: { strategy: "test_id", value: "dashboard" }, verified: true, matchCount: 1 }] },
    { id: "evidence", kind: "screenshot", label: "Capture dashboard evidence" },
  ]) await authoring.appendEvent(session.id, { kind: "action_recorded", payload: { ...action, coverageTags: [], artifactIds: [], provenance: "browser" } } as never);
  await authoring.requestReview(session.id);
  const draft = await authoring.compile(session.id);
  assert(draft.diagnostics.filter((item) => item.severity === "blocker").length === 0, "compiled draft must have no blockers");
  const current = await authoring.getSnapshot(session.id); assert(current, "authoring snapshot exists");
  const version = await approveAuthoringSession({ pool, sessionId: session.id, expectedUpdatedAt: current.session.updatedAt });
  const first = await worker.start({ baseUrl: fixture.baseUrl, variables: { username: "acceptance@example.com", "secret.login_password": "runtime-only" }, workflow: version.workflow });
  const second = await worker.start({ baseUrl: fixture.baseUrl, variables: { username: "acceptance@example.com", "secret.login_password": "runtime-only" }, workflow: version.workflow });
  assert((await wait(first.runId)).status === "passed", "first replay must pass");
  assert((await wait(second.runId)).status === "passed", "second replay must pass");
  assert(first.runId !== second.runId, "replays must have separate run ids");
  const artifacts = await pool.query<{ run_id: string; count: number }>("SELECT run_id, count(*)::int AS count FROM artifacts WHERE run_id = ANY($1::text[]) GROUP BY run_id", [[first.runId, second.runId]]);
  assert(artifacts.rows.length === 2 && artifacts.rows.every((row) => row.count > 0), "each replay must retain independent artifacts");
  console.log(JSON.stringify({ ok: true, version: version.id, runs: [first.runId, second.runId] }));
} finally {
  if (projectId) await pool.query("DELETE FROM projects WHERE id=$1", [projectId]);
  await pool.end(); await new Promise<void>((resolve, reject) => fixture.server.close((error?: Error) => error ? reject(error) : resolve()));
}
