import { expect, test } from "bun:test";

import { createRunService } from "../src/service";

function createStoreFixture() {
  const state = { runs: new Map<string, Record<string, unknown>>(), steps: [] as unknown[] };
  let count = 0;
  return {
    state,
    saveWorkflowVersion: async () => undefined,
    createRun: async (input: Record<string, unknown>) => {
      const run = { id: `run-${++count}`, ...input, status: "queued" };
      state.runs.set(run.id, run);
      return run;
    },
    updateRun: async (id: string, patch: Record<string, unknown>) => Object.assign(state.runs.get(id)!, patch),
    recordStep: async (step: unknown) => state.steps.push(step),
    getRun: async (id: string) => state.runs.get(id),
    getSteps: async () => [],
    migrate: async () => undefined,
    close: async () => undefined,
  };
}

const workflow = { workflowVersionId: "login-v1", steps: [{ id: "open", type: "open_url" as const, url: "{{baseUrl}}/login" }] };

test("returns queued immediately and redacts persisted variables", async () => {
  const store = createStoreFixture();
  const service = createRunService({ store: store as never, runner: async () => ({ runId: "ignored", workflowVersionId: "login-v1", status: "passed" as const, steps: [] }) });
  const created = await service.startRun({ baseUrl: "http://app.test", variables: { password: "secret" }, workflow });
  await service.waitForRun(created.runId);
  expect(created.status).toBe("queued");
  expect(store.state.runs.get(created.runId)?.variables).toEqual({ password: "[REDACTED]" });
});

test("records a browser startup failure as a failed run", async () => {
  const store = createStoreFixture();
  const service = createRunService({
    store: store as never,
    runner: async () => { throw new Error("chromium executable is unavailable"); },
  });

  const created = await service.startRun({ baseUrl: "http://app.test", variables: {}, workflow });
  const result = await service.waitForRun(created.runId);

  expect(result).toMatchObject({ status: "failed", error: "chromium executable is unavailable" });
});
