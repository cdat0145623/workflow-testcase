import type { TestCaseRecord } from "@/features/catalog/types";

import { decryptRuntimePassword, encryptRuntimePassword } from "./crypto";
import { extractRuntimeFields, normalizeAndValidateRuntimeValues } from "./field-registry";
import type { RuntimeValuesRepository, RuntimeValuesWrite } from "./repository";
import type { RuntimeFieldDefinition, RuntimeValuesInput } from "./types";
import type { WorkflowGraph } from "../model/types";

export interface RuntimeValuesServicePorts {
  catalog: Pick<{ getTestCase(id: string): Promise<TestCaseRecord | undefined> }, "getTestCase">;
  runtimeValues: RuntimeValuesRepository;
  secretKey?: string;
}

function storedValue(field: RuntimeFieldDefinition, stored: RuntimeValuesWrite): string {
  if (!field.persistedKey) return "";
  if (field.persistedKey === "password") return stored.passwordCiphertext;
  return stored[field.persistedKey];
}

export function createRuntimeValuesService(ports: RuntimeValuesServicePorts) {
  async function getTestCase(testCaseId: string): Promise<TestCaseRecord> {
    const testCase = await ports.catalog.getTestCase(testCaseId);
    if (!testCase) throw new Error("Test case not found");
    return testCase;
  }

  return {
    async getForGraph(testCaseId: string, graphOverride?: WorkflowGraph) {
      const testCase = await getTestCase(testCaseId);
      const fields = extractRuntimeFields(graphOverride ?? testCase.graph);
      const stored = await ports.runtimeValues.get(testCaseId);
      const values: Record<string, string> = {};
      for (const field of fields) {
        if (!stored || !field.persistedKey) {
          values[field.key] = "";
          continue;
        }
        const value = storedValue(field, stored);
        values[field.key] = field.persistedKey === "password" && value
          ? decryptRuntimePassword(value, ports.secretKey)
          : value;
      }
      return { fields, values };
    },
    async prepareForPersistence(testCaseId: string, input: RuntimeValuesInput, graphOverride?: WorkflowGraph) {
      const testCase = await getTestCase(testCaseId);
      const fields = extractRuntimeFields(graphOverride ?? testCase.graph);
      const normalized = normalizeAndValidateRuntimeValues(fields, input);
      const existing = await ports.runtimeValues.get(testCaseId);
      const storedValues: RuntimeValuesWrite = {
        username: normalized.persisted.username || existing?.username || "",
        passwordCiphertext: normalized.persisted.password
          ? encryptRuntimePassword(normalized.persisted.password, ports.secretKey)
          : existing?.passwordCiphertext || "",
        taskTitle: normalized.persisted.taskTitle || existing?.taskTitle || "",
        assigneeName: normalized.persisted.assigneeName || existing?.assigneeName || "",
      };
      return { workerVariables: normalized.values, storedValues };
    },
    async persist(testCaseId: string, input: RuntimeValuesInput) {
      const prepared = await this.prepareForPersistence(testCaseId, input);
      await ports.runtimeValues.upsert(testCaseId, prepared.storedValues);
      return prepared;
    },
  };
}
