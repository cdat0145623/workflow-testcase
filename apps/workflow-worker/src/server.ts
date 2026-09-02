import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { runRequestSchema } from "@cwa-dev/sendkit-workflow-contract";

import { createRunService } from "./service";
import { createStore, type WorkflowStore } from "./store";

async function readBody(request: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("Request body is too large");
  }
  return body ? JSON.parse(body) : {};
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

export function createWorkerServer({ store, service }: { store: WorkflowStore; service: ReturnType<typeof createRunService> }) {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean);
    try {
      if (request.method === "GET" && url.pathname === "/health") return sendJson(response, 200, { status: "ok", service: "workflow-worker" });
      if (request.method === "POST" && url.pathname === "/runs") return sendJson(response, 202, await service.startRun(runRequestSchema.parse(await readBody(request))));
      if (parts[0] === "runs" && parts[1]) {
        const runId = parts[1];
        if (request.method === "GET" && parts.length === 2) {
          const run = await store.getRun(runId);
          return run ? sendJson(response, 200, { ...run, steps: await store.getSteps(runId) }) : sendJson(response, 404, { error: "Run not found" });
        }
        if (request.method === "GET" && parts[2] === "steps") {
          const run = await store.getRun(runId);
          return run ? sendJson(response, 200, await store.getSteps(runId)) : sendJson(response, 404, { error: "Run not found" });
        }
        if (request.method === "POST" && parts[2] === "cancel") {
          const run = await store.getRun(runId);
          return run ? sendJson(response, 200, await service.cancelRun(runId)) : sendJson(response, 404, { error: "Run not found" });
        }
      }
      return sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      return sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

export function createConfiguredWorker({ connectionString = process.env.DATABASE_URL, artifactsRoot = process.env.ARTIFACTS_ROOT ?? ".local-data/artifacts" }: { connectionString?: string; artifactsRoot?: string } = {}) {
  const store = createStore({ connectionString });
  const service = createRunService({ store, artifactsRoot });
  return { server: createWorkerServer({ store, service }), store };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { server, store } = createConfiguredWorker();
  await store.migrate(new URL("../sql/", import.meta.url));
  server.listen(Number(process.env.PORT ?? 8787), "0.0.0.0", () => console.log("workflow-worker listening on 8787"));
}
