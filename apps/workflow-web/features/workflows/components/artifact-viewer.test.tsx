import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ArtifactViewer } from "./artifact-viewer";

afterEach(cleanup);

test("opens the selected evidence at full size", () => {
  render(<ArtifactViewer runId="run-1" stepId="wait-calendar" />);

  fireEvent.click(screen.getByRole("button", { name: "Open wait-calendar after screenshot" }));

  const dialog = screen.getByRole("dialog", { name: "wait-calendar after screenshot" });
  expect(dialog).toBeTruthy();
  expect(screen.getByAltText("wait-calendar after screenshot full size")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Close evidence preview" })).toBeTruthy();
});
