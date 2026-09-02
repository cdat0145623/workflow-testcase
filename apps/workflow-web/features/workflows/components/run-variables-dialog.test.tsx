import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { RunVariablesDialog } from "./run-variables-dialog";

afterEach(cleanup);

test("submits runtime variables without rendering their values after closing", () => {
  const submissions: Array<Record<string, string>> = [];
  render(<RunVariablesDialog open onOpenChange={() => undefined} onRun={(variables) => submissions.push(variables)} />);

  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "operator" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "super-secret" } });
  fireEvent.change(screen.getByLabelText("Task title"), { target: { value: "Verify daily task" } });
  fireEvent.change(screen.getByLabelText("Assignee name"), { target: { value: "Taylor" } });
  fireEvent.click(screen.getByRole("button", { name: "Run workflow" }));

  expect(submissions).toEqual([{ username: "operator", password: "super-secret", taskTitle: "Verify daily task", assigneeName: "Taylor" }]);
  expect(screen.queryByDisplayValue("super-secret")).toBeNull();
});
