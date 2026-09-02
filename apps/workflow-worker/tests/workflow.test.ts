import { expect, test } from "bun:test";

import { interpolateStep, interpolateValue } from "../src/workflow";

test("interpolates nested variables and preserves unknown tokens", () => {
  expect(interpolateValue("{{user.email}} / {{missing}}", { "user.email": "test@example.com" })).toBe(
    "test@example.com / {{missing}}",
  );
});

test("interpolates workflow step values without mutating the source step", () => {
  const source = { id: "email", type: "fill" as const, locator: { strategy: "test_id" as const, value: "email" }, value: "{{email}}" };
  const result = interpolateStep(source, { email: "test@example.com" });

  expect(result.value).toBe("test@example.com");
  expect(source.value).toBe("{{email}}");
});
