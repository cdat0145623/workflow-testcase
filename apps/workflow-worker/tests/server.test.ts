import { expect, test } from "bun:test";

import { createWorkerServer } from "../src/server";

test("serves health and returns queued runs", async () => {
  const store = {
    getRun: async () => undefined,
    getSteps: async () => [],
  };
  const service = {
    startRun: async () => ({ runId: "run-1", status: "queued" as const }),
    cancelRun: async () => undefined,
  };
  const server = createWorkerServer({ store: store as never, service: service as never });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  try {
    expect(await fetch(`${baseUrl}/health`).then((response) => response.json())).toEqual({ status: "ok", service: "workflow-worker" });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("returns 404 for steps belonging to an unknown run", async () => {
  const store = {
    getRun: async () => undefined,
    getSteps: async () => [],
  };
  const service = {
    startRun: async () => ({ runId: "run-1", status: "queued" as const }),
    cancelRun: async () => undefined,
  };
  const server = createWorkerServer({ store: store as never, service: service as never });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  try {
    expect((await fetch(`${baseUrl}/runs/missing/steps`)).status).toBe(404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
