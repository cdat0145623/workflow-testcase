import { createServer } from "node:http";
import pg from "pg";
import { chromium } from "playwright";

const webBaseUrl = process.env.WEB_BASE_URL ?? "http://workflow-web:3000";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const suffix = crypto.randomUUID().slice(0, 8);
const fixturePort = 3003;
const fixtureBaseUrl = `http://workflow-history-acceptance:${fixturePort}`;
let projectId = "";
let browser;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function assert(value, message) { if (!value) throw new Error(message); }
const node = (id, type, values = {}) => ({ id, type: "step", position: { x: 0, y: 0 }, data: { type, kind: type === "start" ? "trigger" : "action", title: id, values } });
const graph = {
  nodes: [
    node("start", "start"),
    node("open", "open-url", { url: "{{baseUrl}}/login" }),
    node("username", "fill", { locatorStrategy: "test_id", locatorValue: "username", value: "{{username}}" }),
    node("password", "fill", { locatorStrategy: "test_id", locatorValue: "password", value: "{{password}}" }),
    node("task", "fill", { locatorStrategy: "test_id", locatorValue: "task", value: "{{taskTitle}}" }),
    node("assignee", "fill", { locatorStrategy: "test_id", locatorValue: "assignee", value: "{{assigneeName}}" }),
    node("login", "click", { locatorStrategy: "test_id", locatorValue: "login" }),
    node("verify", "expect-visible", { locatorStrategy: "test_id", locatorValue: "dashboard" }),
    node("evidence", "screenshot", { fullPage: "true" }),
  ],
  edges: ["open", "username", "password", "task", "assignee", "login", "verify", "evidence"].map((target, index) => ({ id: `edge-${target}`, source: index ? ["open", "username", "password", "task", "assignee", "login", "verify"][index - 1] : "start", target })),
};
const graphB = structuredClone(graph);
graphB.nodes.find((item) => item.id === "task").data.title = "Enter second daily task";

const fixture = createServer((_request, response) => response.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><main><input data-testid="username"><input data-testid="password"><input data-testid="task"><input data-testid="assignee"><button data-testid="login">Login</button><section data-testid="dashboard" hidden>Done</section></main><script>document.querySelector('[data-testid=login]').onclick=()=>document.querySelector('[data-testid=dashboard]').hidden=false</script>`));

async function request(path, options) {
  const response = await fetch(`${webBaseUrl}${path}`, options);
  const body = await response.json();
  if (!response.ok) throw new Error(`${path}: ${body.error ?? response.status}`);
  return body;
}
async function waitForWeb() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${webBaseUrl}/projects`, { redirect: "manual" });
      if (response.status >= 200 && response.status < 500) return;
    } catch {
      // Next.js is still compiling its local development runtime.
    }
    await sleep(250);
  }
  throw new Error("workflow web did not become ready within 45 seconds");
}
async function waitForTerminal(runId) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const run = await request(`/api/runs/${runId}`);
    if (["passed", "failed", "cancelled"].includes(run.status)) return run;
    await sleep(150);
  }
  throw new Error(`run ${runId} timed out`);
}

try {
  await new Promise((resolve, reject) => fixture.listen(fixturePort, "0.0.0.0", (error) => error ? reject(error) : resolve()));
  await waitForWeb();
  const project = await pool.query("INSERT INTO projects(name, slug) VALUES ($1,$2) RETURNING id", [`Runtime history acceptance ${suffix}`, `runtime-history-${suffix}`]);
  projectId = project.rows[0].id;
  const feature = await pool.query("INSERT INTO features(project_id, name, slug) VALUES ($1,$2,$3) RETURNING id", [projectId, "Runtime presets", `runtime-presets-${suffix}`]);
  const testCase = await pool.query("INSERT INTO test_cases(feature_id, name, slug, base_url, graph) VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING id", [feature.rows[0].id, "Sanitized runtime history", `sanitized-runtime-${suffix}`, fixtureBaseUrl, JSON.stringify(graph)]);
  const testCaseId = testCase.rows[0].id;
  const initialValues = { username: "operator", password: "not-a-real-password", taskTitle: "First daily task", assigneeName: "Taylor" };
  const first = await request("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "start", testCaseId, graph, variables: initialValues }) });
  assert((await waitForTerminal(first.runId)).status === "passed", "first run must pass");
  const preset = await request(`/api/test-cases/${testCaseId}/runtime-values`);
  assert(preset.values.password === initialValues.password && preset.values.taskTitle === initialValues.taskTitle, "internal preset must prefill clear-text values");
  const storedPreset = await pool.query("SELECT password_ciphertext FROM test_case_runtime_values WHERE test_case_id=$1", [testCaseId]);
  assert(storedPreset.rows.length === 1 && !storedPreset.rows[0].password_ciphertext.includes(initialValues.password), "password must be ciphertext at rest");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto(`${webBaseUrl}/projects/${projectId}/features/${feature.rows[0].id}/test-cases/${testCaseId}`);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  const runDialog = page.locator("dialog[open]").filter({ hasText: "Run workflow" });
  await page.waitForFunction(({ username, password, taskTitle }) => {
    const value = (id) => document.getElementById(id)?.value;
    return value("run-username") === username && value("run-password") === password && value("run-taskTitle") === taskTitle;
  }, initialValues);
  assert(await runDialog.getByLabel("Username").inputValue() === initialValues.username, "UI must prefill username after reload");
  assert(await runDialog.getByLabel("Password").inputValue() === initialValues.password, "UI must prefill internal clear-text password after reload");
  assert(await runDialog.getByLabel("Task title").inputValue() === initialValues.taskTitle, "UI must prefill task title after reload");
  await runDialog.getByRole("button", { name: "Cancel" }).click();
  const invalid = await fetch(`${webBaseUrl}/api/runs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "start", testCaseId, graph, variables: { ...initialValues, taskTitle: "" } }) });
  assert(invalid.status === 422, "empty graph-required task title must be rejected before creating a run");
  assert((await request(`/api/test-cases/${testCaseId}/versions`)).length === 1, "invalid values must not create a version");
  const secondValues = { ...initialValues, taskTitle: "Second daily task", assigneeName: "Morgan" };
  const second = await request("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "start", testCaseId, graph: graphB, variables: secondValues }) });
  assert((await waitForTerminal(second.runId)).status === "passed", "second run must pass");
  const versions = await request(`/api/test-cases/${testCaseId}/versions`);
  assert(versions.length === 2 && versions[0].versionNumber === 2 && versions[1].versionNumber === 1, "versions must be newest-first");
  const v1 = await request(`/api/workflow-versions/${versions[1].id}`);
  const v2 = await request(`/api/workflow-versions/${versions[0].id}`);
  assert(v1.graph.nodes.find((item) => item.id === "task")?.data.title === "task" && v2.graph.nodes.find((item) => item.id === "task")?.data.title === "Enter second daily task", "version details must retain their immutable graphs");
  await page.getByRole("button", { name: "Versions", exact: true }).click();
  await page.getByRole("button", { name: "View v1" }).click();
  await page.getByLabel("Immutable workflow graph").waitFor();
  await page.getByRole("button", { name: "Restore v1 as draft" }).click();
  const save = page.getByRole("button", { name: "Save" });
  await save.waitFor({ state: "visible" });
  await save.click();
  await page.getByText("All changes saved", { exact: true }).waitFor();
  await page.reload();
  const restored = await pool.query("SELECT graph FROM test_cases WHERE id=$1", [testCaseId]);
  assert(restored.rows[0].graph.nodes.find((item) => item.id === "task")?.data.title === "task", "restore plus explicit Save must persist v1 draft");
  const replay = await request(`/api/workflow-versions/${versions[1].id}/runs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ variables: secondValues }) });
  assert((await waitForTerminal(replay.runId)).status === "passed", "exact v1 replay must pass");
  const afterReplay = await request(`/api/test-cases/${testCaseId}/versions`);
  assert(afterReplay.length === 2, "version replay must not create v3");
  const third = await request("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "start", testCaseId, graph: v1.graph, variables: secondValues }) });
  assert((await waitForTerminal(third.runId)).status === "passed", "restored draft normal run must pass");
  const afterThird = await request(`/api/test-cases/${testCaseId}/versions`);
  assert(afterThird.length === 3 && afterThird[0].versionNumber === 3, "next normal Run must create v3");
  const originalV2 = await request(`/api/workflow-versions/${versions[0].id}`);
  assert(originalV2.graph.nodes.find((item) => item.id === "task")?.data.title === "Enter second daily task", "v2 must remain immutable after restore and v3");
  const history = await request(`/api/test-cases/${testCaseId}/runs?limit=50`);
  assert(history.length === 4 && history[0].id === third.runId, "persisted history must survive independent API reads");
  const redaction = await pool.query("SELECT variables::text AS variables FROM test_runs WHERE id = ANY($1::text[])", [[first.runId, second.runId, replay.runId, third.runId]]);
  assert(redaction.rows.every((row) => !row.variables.includes(initialValues.password)), "run variables must remain redacted");
  assert((await pool.query("SELECT count(*)::int AS count FROM test_case_runtime_values WHERE test_case_id=$1", [testCaseId])).rows[0].count === 1, "each test case must retain exactly one current preset row");
  console.log(JSON.stringify({ ok: true, testCaseId, versions: afterThird.map((version) => version.versionNumber), runs: history.length }));
} finally {
  if (projectId) {
    const versions = await pool.query("SELECT id FROM workflow_versions WHERE test_case_id IN (SELECT tc.id FROM test_cases tc JOIN features f ON f.id=tc.feature_id WHERE f.project_id=$1)", [projectId]);
    const ids = versions.rows.map((row) => row.id);
    if (ids.length) await pool.query("DELETE FROM test_runs WHERE workflow_version_id = ANY($1::text[])", [ids]);
    if (ids.length) await pool.query("DELETE FROM workflow_versions WHERE id = ANY($1::text[])", [ids]);
    await pool.query("DELETE FROM projects WHERE id=$1", [projectId]);
  }
  await pool.end();
  await browser?.close();
  await new Promise((resolve) => fixture.close(resolve));
}
