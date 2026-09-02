import { RuntimeValuesValidationError } from "../runtime-values/field-registry";
import { WorkerHttpError } from "./worker-client";

export function runErrorPayload(error: unknown): { status: number; body: { error: string; fieldErrors?: Record<string, string> } } {
  if (error instanceof RuntimeValuesValidationError) {
    return { status: 422, body: { error: error.message, fieldErrors: error.fieldErrors } };
  }
  if (error instanceof Error && (error.message === "Test case not found" || error.message === "Workflow version not found")) {
    return { status: 404, body: { error: error.message } };
  }
  if (error instanceof WorkerHttpError || error instanceof TypeError) {
    return { status: 503, body: { error: error instanceof Error ? error.message : "Worker unavailable" } };
  }
  return { status: 500, body: { error: "Unable to prepare workflow run" } };
}
