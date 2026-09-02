import { afterAll, beforeAll, expect, test } from "bun:test";
import { createServer } from "node:http";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runWorkflow } from "../src/runner";

let fixture: ReturnType<typeof createServer>;
let baseUrl = "";

beforeAll(async () => {
  fixture = createServer((request, response) => {
    if (request.url !== "/login") { response.writeHead(404); response.end(); return; }
    response.setHeader("content-type", "text/html");
    response.end('<form id="form"><input data-testid="email"><button data-testid="login">Login</button></form><main data-testid="dashboard" hidden>Dashboard</main><script>document.querySelector("#form").addEventListener("submit",event=>{event.preventDefault();document.querySelector("[data-testid=dashboard]").hidden=false})</script>');
  });
  await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const address = fixture.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

afterAll(async () => new Promise<void>((resolve, reject) => fixture.close((error) => error ? reject(error) : resolve())));

test("writes trace, reports, logs and screenshots for a successful workflow", async () => {
  const artifactsDir = await mkdtemp(join(tmpdir(), "sendkit-workflow-"));
  const result = await runWorkflow({
    workflow: { runId: "run-1", workflowVersionId: "login-v1", steps: [
      { id: "open", type: "open_url", url: "{{baseUrl}}/login" },
      { id: "email", type: "fill", locator: { strategy: "test_id", value: "email" }, value: "test@example.com" },
      { id: "submit", type: "click", locator: { strategy: "test_id", value: "login" } },
      { id: "dashboard", type: "expect_visible", locator: { strategy: "test_id", value: "dashboard" } },
    ] },
    variables: { baseUrl }, artifactsDir,
  });
  expect(result.status).toBe("passed");
  expect(await readdir(artifactsDir)).toEqual(expect.arrayContaining(["trace.zip", "report.json", "report.html", "run.log", "steps"]));
});
