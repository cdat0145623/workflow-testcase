import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { chromium } from "playwright";
import pg from "pg";

const baseUrl = process.env.WEB_BASE_URL ?? "http://workflow-web:3000";
const outputDir = process.env.UI_OUTPUT_DIR ?? "/app/output";
const suffix = Date.now().toString(36);
const projectA = `Acceptance A ${suffix}`;
const projectB = `Acceptance B ${suffix}`;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const fixtureBaseUrl = "http://workflow-ui-acceptance:3001";

const fixtureServer = createServer((request, response) => {
  const finish = () => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end('<main data-testid="ready">Acceptance fixture</main>');
  };
  if (request.url === "/delay") setTimeout(finish, 3_000);
  else finish();
});

async function createProject(page, name) {
  await page.getByRole("button", { name: "+ New project" }).click();
  await page.waitForTimeout(250);
  const dialogStates = await page.locator("dialog").evaluateAll((dialogs) => dialogs.map((dialog) => ({ open: dialog.open, text: dialog.textContent?.slice(0, 80) })));
  if (!dialogStates.some((dialog) => dialog.open)) throw new Error(`Project dialog did not open: ${JSON.stringify(dialogStates)}`);
  const dialog = page.locator("dialog[open]");
  await dialog.getByLabel("Project name").fill(name);
  await dialog.getByRole("button", { name: "Create" }).click();
  await page.getByText(name, { exact: true }).waitFor();
}

async function createFeature(page, projectName, featureName) {
  const project = page.locator("details").filter({ hasText: projectName }).first();
  await project.getByRole("button", { name: "+ New feature" }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByLabel("Feature name").fill(featureName);
  await dialog.getByRole("button", { name: "Create" }).click();
  await page.getByText(featureName, { exact: true }).waitFor();
}

async function createTestCase(page, projectName, featureName, caseName) {
  const project = page.locator("details").filter({ hasText: projectName }).first();
  const feature = project.locator("details").filter({ hasText: featureName }).first();
  await feature.getByRole("button", { name: "+ New test case" }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByLabel("Test case name").fill(caseName);
  await dialog.getByLabel("Base URL").fill(fixtureBaseUrl);
  await dialog.getByRole("button", { name: "Create" }).click();
  await page.getByRole("heading", { name: caseName }).waitFor();
}

async function waitForNewRun(page, previousRunLabel) {
  await page.waitForFunction((previous) => {
    const label = [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("run-"))?.textContent ?? "";
    return label && label !== previous;
  }, previousRunLabel);
}

async function waitForWeb() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/projects`, { redirect: "manual" });
      if (response.status >= 200 && response.status < 500) return;
    } catch {
      // Next.js is still installing/building its development runtime.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Workflow web did not become ready within 45 seconds");
}

async function connectInitialNodes(page) {
  const startHandle = page.locator('.react-flow__node').filter({ hasText: "Start" }).locator('.react-flow__handle.source');
  const targetHandle = page.locator('.react-flow__node').filter({ hasText: "Open URL 1" }).locator('.react-flow__handle.target');
  const source = await startHandle.boundingBox();
  const target = await targetHandle.boundingBox();
  if (!source || !target) throw new Error("Workflow handles were not rendered");
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, colorScheme: "dark" });
page.on("console", (message) => console.log(`browser:${message.type()}:${message.text()}`));
page.on("pageerror", (error) => console.log(`browser:pageerror:${error.message}`));
try {
  await new Promise((resolve, reject) => fixtureServer.listen(3001, "0.0.0.0", (error) => error ? reject(error) : resolve()));
  await mkdir(outputDir, { recursive: true });
  await waitForWeb();
  await page.goto(`${baseUrl}/projects`);
  await page.waitForLoadState("networkidle");
  await createProject(page, projectA);
  await createFeature(page, projectA, "Health check");
  await createTestCase(page, projectA, "Health check", "Worker health passes");
  await page.locator(".react-flow__node").first().waitFor();
  await connectInitialNodes(page);
  await page.getByRole("button", { name: "Run", exact: true }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await page.getByText("passed", { exact: true }).waitFor({ timeout: 20_000 });
  const firstRunRow = page.locator("button").filter({ hasText: "run-" }).first();
  const firstRunLabel = await firstRunRow.textContent();
  const firstRunId = (await pool.query(
    "SELECT tr.id FROM test_runs tr JOIN workflow_versions wv ON wv.id = tr.workflow_version_id JOIN test_cases tc ON tc.id = wv.test_case_id JOIN features f ON f.id = tc.feature_id JOIN projects p ON p.id = f.project_id WHERE p.name = $1 ORDER BY tr.created_at DESC LIMIT 1",
    [projectA],
  )).rows[0]?.id;
  if (!firstRunId) throw new Error("Passing UI run was not persisted");
  const reportResponse = await page.request.get(`${baseUrl}/api/artifacts/${firstRunId}/report.json`);
  if (!reportResponse.ok()) throw new Error(`Run report was not readable (${reportResponse.status()})`);
  if ((await page.request.get(`${baseUrl}/api/artifacts/${firstRunId}/../package.json`)).status() !== 404) throw new Error("Artifact traversal was not rejected");

  await firstRunRow.click();
  await page.getByRole("button", { name: "Run again", exact: true }).click();
  await waitForNewRun(page, firstRunLabel);
  await page.getByText("passed", { exact: true }).waitFor({ timeout: 20_000 });
  const replayVersions = await pool.query(
    "SELECT tr.workflow_version_id FROM test_runs tr JOIN workflow_versions wv ON wv.id = tr.workflow_version_id JOIN test_cases tc ON tc.id = wv.test_case_id JOIN features f ON f.id = tc.feature_id JOIN projects p ON p.id = f.project_id WHERE p.name = $1 ORDER BY tr.created_at DESC LIMIT 2",
    [projectA],
  );
  if (replayVersions.rows.length !== 2 || replayVersions.rows[0].workflow_version_id !== replayVersions.rows[1].workflow_version_id) {
    throw new Error("Run again did not preserve the immutable workflow version");
  }

  await page.locator(".react-flow__node").filter({ hasText: "Open URL 1" }).click();
  await page.locator("#open-url-url").fill("{{baseUrl}}/delay");
  const runsBeforeCancel = Number((await pool.query(
    "SELECT count(*)::int AS count FROM test_runs tr JOIN workflow_versions wv ON wv.id = tr.workflow_version_id JOIN test_cases tc ON tc.id = wv.test_case_id JOIN features f ON f.id = tc.feature_id JOIN projects p ON p.id = f.project_id WHERE p.name = $1",
    [projectA],
  )).rows[0].count);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await page.getByText("running", { exact: true }).waitFor({ timeout: 20_000 });
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.getByText("cancelled", { exact: true }).waitFor({ timeout: 20_000 });
  const runsAfterCancel = Number((await pool.query(
    "SELECT count(*)::int AS count FROM test_runs tr JOIN workflow_versions wv ON wv.id = tr.workflow_version_id JOIN test_cases tc ON tc.id = wv.test_case_id JOIN features f ON f.id = tc.feature_id JOIN projects p ON p.id = f.project_id WHERE p.name = $1",
    [projectA],
  )).rows[0].count);
  if (runsAfterCancel !== runsBeforeCancel + 1) throw new Error("Cancellation created an unexpected number of runs");
  await page.screenshot({ path: `${outputDir}/phase-2-local-run.png`, fullPage: true });

  await page.goto(`${baseUrl}/projects`);
  await createProject(page, projectB);
  await createFeature(page, projectB, "Search");
  await createTestCase(page, projectB, "Search", "Search isolation");
  await page.locator(".react-flow__node").first().waitFor();
  await connectInitialNodes(page);
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByText("All changes saved", { exact: true }).waitFor();
  await page.reload();
  await page.locator(".react-flow__edge").waitFor();
  if (await page.locator(".react-flow__edge").count() !== 1) throw new Error("Saved graph was not restored after refresh");
  const links = await page.locator('a[href*="/test-cases/"]').evaluateAll((items) => items.map((item) => item.getAttribute("href")));
  if (new Set(links).size !== links.length || links.length < 2) throw new Error("Test-case route identities are not isolated");
  await page.screenshot({ path: `${outputDir}/phase-2-catalog-isolation.png`, fullPage: true });
  console.log(JSON.stringify({ ok: true, passingRun: firstRunId, replayVersionStable: true, cancelledRun: true, artifactTraversalRejected: true, screenshots: ["phase-2-local-run.png", "phase-2-catalog-isolation.png"], testCaseLinks: links.length }));
} catch (error) {
  await page.screenshot({ path: `${outputDir}/phase-2-acceptance-failure.png`, fullPage: true });
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => fixtureServer.close(() => resolve()));
  const projectRows = await pool.query("SELECT id FROM projects WHERE name = ANY($1::text[])", [[projectA, projectB]]);
  const projectIds = projectRows.rows.map((row) => row.id);
  if (projectIds.length > 0) {
    const versions = await pool.query("SELECT id FROM workflow_versions WHERE test_case_id IN (SELECT tc.id FROM test_cases tc JOIN features f ON f.id=tc.feature_id WHERE f.project_id = ANY($1::uuid[]))", [projectIds]);
    const versionIds = versions.rows.map((row) => row.id);
    if (versionIds.length > 0) await pool.query("DELETE FROM test_runs WHERE workflow_version_id = ANY($1::text[])", [versionIds]);
    if (versionIds.length > 0) await pool.query("DELETE FROM workflow_versions WHERE id = ANY($1::text[])", [versionIds]);
    await pool.query("DELETE FROM projects WHERE id = ANY($1::uuid[])", [projectIds]);
  }
  await pool.end();
}
