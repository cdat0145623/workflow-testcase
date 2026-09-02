import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { Locator, Page } from "playwright";

import type { WorkflowStep } from "@cwa-dev/sendkit-workflow-contract";

import { interpolateStep } from "./workflow";

const DEFAULT_TIMEOUT = 30_000;

function getLocator(page: Page, locator: Extract<WorkflowStep, { locator: unknown }> ["locator"]): Locator {
  switch (locator.strategy) {
    case "test_id": return page.getByTestId(locator.value);
    case "role": return page.getByRole(locator.role, { name: locator.name });
    case "label": return page.getByLabel(locator.value);
    case "name":
    case "css":
    case "xpath": return page.locator(locator.value);
  }
}

export interface ExecuteStepOptions {
  variables: Record<string, string>;
  artifactsDir?: string;
}

export async function executeStep(page: Page, rawStep: WorkflowStep, options: ExecuteStepOptions): Promise<Record<string, unknown>> {
  const step = interpolateStep(rawStep, options.variables);
  const timeout = step.timeout ?? DEFAULT_TIMEOUT;

  switch (step.type) {
    case "open_url":
      await page.goto(step.url, { waitUntil: "load", timeout });
      return { action: "open_url", url: page.url() };
    case "click":
      await getLocator(page, step.locator).click({ timeout });
      return { action: "click" };
    case "fill":
      await getLocator(page, step.locator).fill(step.value, { timeout });
      return { action: "fill" };
    case "select":
      await getLocator(page, step.locator).selectOption(step.option, { timeout });
      return { action: "select" };
    case "wait_for":
      await getLocator(page, step.locator).waitFor({ state: step.state ?? "visible", timeout });
      return { action: "wait_for" };
    case "expect_visible":
      await getLocator(page, step.locator).waitFor({ state: "visible", timeout });
      return { action: "expect_visible" };
    case "expect_text": {
      const locator = getLocator(page, step.locator);
      await locator.waitFor({ state: "visible", timeout });
      const actual = await locator.textContent();
      if (!actual?.includes(step.text)) throw new Error(`Expected text ${JSON.stringify(step.text)}, received ${JSON.stringify(actual)}`);
      return { action: "expect_text", text: actual };
    }
    case "screenshot": {
      if (!options.artifactsDir) throw new Error("Screenshot step requires artifactsDir");
      await mkdir(options.artifactsDir, { recursive: true });
      const path = join(options.artifactsDir, `${step.id}.png`);
      await page.screenshot({ path, fullPage: step.fullPage ?? true });
      return { action: "screenshot", path };
    }
  }
}

export { DEFAULT_TIMEOUT, getLocator };
