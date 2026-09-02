import { expect, test } from "bun:test";

import { appMetadata } from "../app/metadata";

test("exposes stable application metadata", () => {
  expect(appMetadata).toEqual({ title: "SendKit Workflows" });
});
