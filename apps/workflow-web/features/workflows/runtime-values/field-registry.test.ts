import { describe, expect, test } from "bun:test";

import type { WorkflowGraph } from "../model/types";
import { RuntimeValuesValidationError, extractRuntimeFields, normalizeAndValidateRuntimeValues } from "./field-registry";

const graph: WorkflowGraph = {
  nodes: [
    {
      id: "start",
      type: "step",
      position: { x: 0, y: 0 },
      data: { type: "start", kind: "trigger", title: "Start", values: {} },
    },
    {
      id: "login",
      type: "step",
      position: { x: 300, y: 0 },
      data: {
        type: "fill",
        kind: "action",
        title: "Sign in",
        values: {
          username: "{{username}}",
          password: "{{secret.login_password}}",
          ignored: "{{baseUrl}}/login",
          title: "Daily: {{taskTitle}}",
          assignee: "{{assigneeName}}",
          custom: "{{departmentCode}}",
        },
      },
    },
  ],
  edges: [{ id: "start-login", source: "start", target: "login" }],
};

describe("runtime field registry", () => {
  test("discovers each referenced runtime field once in first-use order", () => {
    expect(extractRuntimeFields(graph)).toEqual([
      { key: "username", label: "Username", sensitive: false, persistedKey: "username", required: true },
      { key: "secret.login_password", label: "Password", sensitive: true, persistedKey: "password", required: true },
      { key: "taskTitle", label: "Task title", sensitive: false, persistedKey: "taskTitle", required: true },
      { key: "assigneeName", label: "Assignee name", sensitive: false, persistedKey: "assigneeName", required: true },
      { key: "departmentCode", label: "Department code", sensitive: false, required: true },
    ]);
  });

  test("normalizes only referenced known values and preserves the original secret placeholder", () => {
    const result = normalizeAndValidateRuntimeValues(extractRuntimeFields(graph), {
      username: "operator",
      "secret.login_password": "secret",
      taskTitle: "  Verify daily task  ",
      assigneeName: "  Taylor  ",
      departmentCode: "ENG",
      unused: "must-not-leak",
    });

    expect(result).toEqual({
      values: {
        username: "operator",
        "secret.login_password": "secret",
        taskTitle: "Verify daily task",
        assigneeName: "Taylor",
        departmentCode: "ENG",
      },
      persisted: {
        username: "operator",
        password: "secret",
        taskTitle: "Verify daily task",
        assigneeName: "Taylor",
      },
    });
  });

  test("blocks a missing referenced task title with a field-level error", () => {
    expect(() => normalizeAndValidateRuntimeValues(extractRuntimeFields(graph), {
      username: "operator",
      "secret.login_password": "secret",
      taskTitle: "  ",
      assigneeName: "Taylor",
      departmentCode: "ENG",
    })).toThrow(RuntimeValuesValidationError);

    try {
      normalizeAndValidateRuntimeValues(extractRuntimeFields(graph), {
        username: "operator",
        "secret.login_password": "secret",
        taskTitle: "  ",
        assigneeName: "Taylor",
        departmentCode: "ENG",
      });
    } catch (error) {
      expect(error).toEqual(new RuntimeValuesValidationError({ taskTitle: "Task title is required" }));
    }
  });
});
