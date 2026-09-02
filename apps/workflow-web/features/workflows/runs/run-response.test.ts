import { expect, test } from "bun:test";

import { RuntimeValuesValidationError } from "../runtime-values/field-registry";
import { WorkerHttpError } from "./worker-client";
import { runErrorPayload } from "./run-response";

test("maps runtime validation, missing records, worker failures and persistence failures to stable API statuses", () => {
  expect(runErrorPayload(new RuntimeValuesValidationError({ taskTitle: "Task title is required" }))).toEqual({ status: 422, body: { error: "Runtime values are invalid", fieldErrors: { taskTitle: "Task title is required" } } });
  expect(runErrorPayload(new Error("Workflow version not found"))).toEqual({ status: 404, body: { error: "Workflow version not found" } });
  expect(runErrorPayload(new WorkerHttpError("Worker unavailable", 500))).toEqual({ status: 503, body: { error: "Worker unavailable" } });
  expect(runErrorPayload(new Error("database unavailable"))).toEqual({ status: 500, body: { error: "Unable to prepare workflow run" } });
});
