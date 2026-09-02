import { expect, test } from "bun:test";

import { executeStep } from "../src/executor";

function pageFixture() {
  const calls: unknown[][] = [];
  const locator = {
    click: async () => calls.push(["click"]),
    fill: async (value: string) => calls.push(["fill", value]),
    selectOption: async (value: string | string[]) => calls.push(["selectOption", value]),
    waitFor: async (options: unknown) => calls.push(["waitFor", options]),
    textContent: async () => "Welcome dashboard",
  };

  return {
    calls,
    page: {
      goto: async (url: string) => calls.push(["goto", url]),
      url: () => "http://app.test/login",
      getByTestId: (value: string) => { calls.push(["getByTestId", value]); return locator; },
      getByRole: (role: string, options: unknown) => { calls.push(["getByRole", role, options]); return locator; },
      getByLabel: (value: string) => { calls.push(["getByLabel", value]); return locator; },
      locator: (value: string) => { calls.push(["locator", value]); return locator; },
      screenshot: async (options: unknown) => calls.push(["screenshot", options]),
    },
  };
}

test("executes fill with interpolated values", async () => {
  const { calls, page } = pageFixture();
  await executeStep(page as never, { id: "email", type: "fill", locator: { strategy: "test_id", value: "email" }, value: "{{email}}" }, { variables: { email: "test@example.com" } });
  expect(calls).toEqual([["getByTestId", "email"], ["fill", "test@example.com"]]);
});

test("executes visible assertion using a role locator", async () => {
  const { calls, page } = pageFixture();
  await executeStep(page as never, { id: "dashboard", type: "expect_visible", locator: { strategy: "role", role: "main", name: "Dashboard" } }, { variables: {} });
  expect(calls).toEqual([["getByRole", "main", { name: "Dashboard" }], ["waitFor", { state: "visible", timeout: 30_000 }]]);
});
