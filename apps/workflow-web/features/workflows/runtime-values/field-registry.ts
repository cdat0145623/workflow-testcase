import type { WorkflowGraph } from "../model/types";
import type { PersistedRuntimeKey, RuntimeFieldDefinition, RuntimeFieldErrors, RuntimeValuesInput, RuntimeValuesNormalized } from "./types";

const placeholderPattern = /\{\{([a-zA-Z][a-zA-Z0-9_.]*)\}\}/g;

const knownFields: Record<string, Omit<RuntimeFieldDefinition, "key" | "required">> = {
  username: { label: "Username", sensitive: false, persistedKey: "username" },
  password: { label: "Password", sensitive: true, persistedKey: "password" },
  "secret.login_password": { label: "Password", sensitive: true, persistedKey: "password" },
  taskTitle: { label: "Task title", sensitive: false, persistedKey: "taskTitle" },
  assigneeName: { label: "Assignee name", sensitive: false, persistedKey: "assigneeName" },
};

export class RuntimeValuesValidationError extends Error {
  constructor(readonly fieldErrors: RuntimeFieldErrors) {
    super("Runtime values are invalid");
    this.name = "RuntimeValuesValidationError";
  }
}

function titleCase(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_.-]+/g, " ")
    .replace(/^./, (value) => value.toUpperCase())
    .toLowerCase()
    .replace(/^./, (value) => value.toUpperCase());
}

export function extractRuntimeFields(graph: WorkflowGraph): RuntimeFieldDefinition[] {
  const fields: RuntimeFieldDefinition[] = [];
  const seen = new Set<string>();

  for (const node of graph.nodes) {
    for (const value of Object.values(node.data.values)) {
      placeholderPattern.lastIndex = 0;
      for (const match of value.matchAll(placeholderPattern)) {
        const key = match[1]!;
        if (key === "baseUrl" || seen.has(key)) continue;
        seen.add(key);
        const known = knownFields[key];
        fields.push({
          key,
          label: known?.label ?? titleCase(key),
          sensitive: known?.sensitive ?? false,
          required: true,
          ...(known?.persistedKey ? { persistedKey: known.persistedKey } : {}),
        });
      }
    }
  }

  return fields;
}

export function normalizeAndValidateRuntimeValues(
  fields: RuntimeFieldDefinition[],
  input: RuntimeValuesInput,
): RuntimeValuesNormalized {
  const values: Record<string, string> = {};
  const persisted = { username: "", password: "", taskTitle: "", assigneeName: "" } satisfies Record<PersistedRuntimeKey, string>;
  const fieldErrors: RuntimeFieldErrors = {};

  for (const field of fields) {
    const value = (input[field.key] ?? "").trim();
    if (!value) {
      fieldErrors[field.key] = `${field.label} is required`;
      continue;
    }
    values[field.key] = value;
    if (field.persistedKey) persisted[field.persistedKey] = value;
  }

  if (Object.keys(fieldErrors).length > 0) throw new RuntimeValuesValidationError(fieldErrors);
  return { values, persisted };
}
