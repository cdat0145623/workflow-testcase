export type PersistedRuntimeKey = "username" | "password" | "taskTitle" | "assigneeName";

export interface RuntimeFieldDefinition {
  key: string;
  label: string;
  sensitive: boolean;
  persistedKey?: PersistedRuntimeKey;
  required: true;
}

export interface RuntimeValuesInput {
  [key: string]: string | undefined;
}

export interface RuntimeValuesNormalized {
  values: Record<string, string>;
  persisted: Record<PersistedRuntimeKey, string>;
}

export type RuntimeFieldErrors = Record<string, string>;
