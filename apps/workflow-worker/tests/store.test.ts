import { expect, test } from "bun:test";

import { createStore } from "../src/store";

test("upserts a final step state instead of inserting a duplicate", async () => {
  const calls: { sql: string; values: unknown[] }[] = [];
  const store = createStore({ pool: { query: async (sql: string, values: unknown[] = []) => { calls.push({ sql, values }); return { rows: [] }; }, end: async () => undefined } as never });
  await store.recordStep({ runId: "run-1", stepId: "open", type: "open_url", status: "running" });
  await store.recordStep({ runId: "run-1", stepId: "open", type: "open_url", status: "passed" });
  expect(calls[0]?.sql).toContain("ON CONFLICT (run_id, step_id) DO UPDATE");
  expect(calls[1]?.values[3]).toBe("passed");
});
