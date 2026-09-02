import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { RunVariablesDialog } from "./run-variables-dialog";

const fields = [
  { key: "username", label: "Username", sensitive: false, persistedKey: "username" as const, required: true as const },
  { key: "taskTitle", label: "Task title", sensitive: false, persistedKey: "taskTitle" as const, required: true as const },
];

afterEach(cleanup);

test("renders only graph-referenced prefilled values and closes after successful run", async () => {
  const submissions: Array<Record<string, string>> = [];
  let open = true;
  render(<RunVariablesDialog fields={fields} initialValues={{ username: "operator", taskTitle: "Initial task" }} open onOpenChange={(next) => { open = next; }} onRun={async (variables) => { submissions.push(variables); }} />);

  expect(screen.getByDisplayValue("operator")).toBeTruthy();
  expect(screen.queryByLabelText("Password")).toBeNull();
  fireEvent.change(screen.getByLabelText("Task title"), { target: { value: "Verify daily task" } });
  fireEvent.click(screen.getByRole("button", { name: "Run workflow" }));

  await waitFor(() => expect(submissions).toHaveLength(1));
  expect(submissions).toEqual([{ username: "operator", taskTitle: "Verify daily task" }]);
  expect(open).toBe(false);
});

test("keeps values and displays field errors when Run fails", async () => {
  render(<RunVariablesDialog fields={fields} initialValues={{ username: "operator", taskTitle: "" }} open onOpenChange={() => undefined} onRun={async () => { throw Object.assign(new Error("Runtime values are invalid"), { fieldErrors: { taskTitle: "Task title is required" } }); }} />);
  fireEvent.click(screen.getByRole("button", { name: "Run workflow" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("alert").textContent).toContain("Task title is required");
  expect(screen.getByDisplayValue("operator")).toBeTruthy();
});

test("blocks submit while presets load", () => {
  render(<RunVariablesDialog fields={fields} open={false} onOpenChange={() => undefined} isLoading onRun={async () => undefined} />);
  expect((screen.getByText("Loading preset…") as HTMLButtonElement).disabled).toBe(true);
});
