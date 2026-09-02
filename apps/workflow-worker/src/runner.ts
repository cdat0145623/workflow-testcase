import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { chromium } from "playwright";

import type { RunResult, StepResult, Workflow } from "@cwa-dev/sendkit-workflow-contract";

import { executeStep } from "./executor";
import { assertValidWorkflow } from "./workflow";

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderHtmlReport(result: RunResult): string {
  const rows = result.steps.map((step) => `<tr><td>${escapeHtml(step.stepId)}</td><td>${escapeHtml(step.type)}</td><td>${escapeHtml(step.status)}</td><td>${escapeHtml(step.error ?? "")}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Workflow ${escapeHtml(result.runId)}</title><style>body{font-family:system-ui,sans-serif;margin:2rem}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:.5rem;text-align:left}th{background:#f3f4f6}</style></head><body><h1>Workflow run ${escapeHtml(result.runId)}</h1><p>Status: <strong>${escapeHtml(result.status)}</strong></p><table><thead><tr><th>Step</th><th>Type</th><th>Status</th><th>Error</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

export interface RunWorkflowOptions {
  workflow: Workflow & { runId: string };
  variables: Record<string, string>;
  artifactsDir: string;
  onStep?: (step: StepResult) => Promise<void> | void;
  shouldCancel?: () => Promise<boolean> | boolean;
}

export async function runWorkflow({ workflow, variables, artifactsDir, onStep = () => undefined, shouldCancel = () => false }: RunWorkflowOptions): Promise<RunResult> {
  assertValidWorkflow(workflow);
  await mkdir(join(artifactsDir, "steps"), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const steps: StepResult[] = [];
  const logs: string[] = [];
  let status: RunResult["status"] = "passed";
  const emit = async (step: StepResult) => {
    logs.push(JSON.stringify({ timestamp: new Date().toISOString(), ...step }));
    await onStep(step);
  };

  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  try {
    for (const rawStep of workflow.steps) {
      if (await shouldCancel()) { status = "cancelled"; break; }
      const startedAt = new Date().toISOString();
      const started = Date.now();
      const name = safeName(rawStep.id);
      const beforePath = join(artifactsDir, "steps", `${name}-before.png`);
      const afterPath = join(artifactsDir, "steps", `${name}-after.png`);
      await page.screenshot({ path: beforePath, fullPage: true });
      const running: StepResult = { runId: workflow.runId, stepId: rawStep.id, type: rawStep.type, status: "running", startedAt };
      await emit(running);
      try {
        const output = await executeStep(page, rawStep, { variables, artifactsDir: join(artifactsDir, "steps") });
        await page.screenshot({ path: afterPath, fullPage: true });
        const result: StepResult = { ...running, status: "passed", finishedAt: new Date().toISOString(), durationMs: Date.now() - started, output, artifacts: [beforePath, afterPath] };
        steps.push(result);
        await emit(result);
      } catch (error) {
        await page.screenshot({ path: afterPath, fullPage: true }).catch(() => undefined);
        const result: StepResult = { ...running, status: "failed", finishedAt: new Date().toISOString(), durationMs: Date.now() - started, error: error instanceof Error ? error.message : String(error), artifacts: [beforePath, afterPath] };
        steps.push(result);
        await emit(result);
        status = "failed";
        break;
      }
    }

    const failedIndex = steps.findIndex((step) => step.status === "failed");
    if (failedIndex >= 0) {
      for (const step of workflow.steps.slice(failedIndex + 1)) {
        const skipped: StepResult = { runId: workflow.runId, stepId: step.id, type: step.type, status: "skipped" };
        steps.push(skipped);
        await emit(skipped);
      }
    }
  } finally {
    await context.tracing.stop({ path: join(artifactsDir, "trace.zip") });
    await context.close();
    await browser.close();
  }

  const result: RunResult = { runId: workflow.runId, workflowVersionId: workflow.workflowVersionId, status, browser: { name: "chromium", version: browser.version() }, steps };
  await writeFile(join(artifactsDir, "report.json"), JSON.stringify(result, null, 2));
  await writeFile(join(artifactsDir, "report.html"), renderHtmlReport(result));
  await writeFile(join(artifactsDir, "run.log"), `${logs.join("\n")}\n`);
  return result;
}
