import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { WorkflowGraph } from "../model/types";
import { WorkflowEditorProvider, useWorkflowEditor } from "./workflow-editor-provider";

const initialGraph: WorkflowGraph = {
  nodes: [
    {
      id: "start",
      type: "step",
      position: { x: 0, y: 0 },
      data: { type: "start", kind: "trigger", title: "Start", values: {} },
    },
  ],
  edges: [],
};

afterEach(cleanup);

function EditorHarness() {
  const editor = useWorkflowEditor();
  const selected = editor.graph.nodes.find((node) => node.id === editor.selectedNodeId);

  return (
    <div>
      <button type="button" onClick={() => editor.addNode("open-url", { x: 240, y: 0 })}>
        Add Open URL
      </button>
      <button
        type="button"
        onClick={() => {
          const openUrl = editor.graph.nodes.find((node) => node.data.type === "open-url");
          if (openUrl) editor.selectNode(openUrl.id);
        }}
      >
        Select Open URL
      </button>
      <button
        type="button"
        onClick={() => {
          if (selected) editor.updateNodeValues(selected.id, { url: "https://example.com" });
        }}
      >
        Set URL
      </button>
      <button
        type="button"
        onClick={() => {
          const openUrl = editor.graph.nodes.find((node) => node.data.type === "open-url");
          if (openUrl) editor.connect("start", openUrl.id);
        }}
      >
        Connect
      </button>
      <button type="button" onClick={() => void editor.save()} disabled={!editor.isDirty}>
        Save
      </button>
      <button type="button" onClick={() => editor.applyApprovedGraph({ ...initialGraph, nodes: [...initialGraph.nodes, { id: "approved", type: "step", position: { x: 240, y: 0 }, data: { type: "open-url", kind: "action", title: "Approved", values: { url: "{{baseUrl}}" } } }], edges: [{ id: "approved-edge", source: "start", target: "approved" }] })}>
        Apply Approved
      </button>
      <output data-testid="selected">{selected?.data.type ?? "none"}</output>
      <output data-testid="url">{selected?.data.values.url ?? ""}</output>
      <output data-testid="edges">{editor.graph.edges.length}</output>
      <output data-testid="problems">{editor.problems.length}</output>
      <output data-testid="dirty">{String(editor.isDirty)}</output>
    </div>
  );
}

describe("WorkflowEditorProvider", () => {
  test("adds, selects, edits and connects a deterministic node", () => {
    render(
      <WorkflowEditorProvider initialGraph={initialGraph} onSave={async () => undefined}>
        <EditorHarness />
      </WorkflowEditorProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add Open URL" }));
    expect(screen.getByTestId("dirty").textContent).toBe("true");
    expect(screen.getByTestId("problems").textContent).not.toBe("0");

    fireEvent.click(screen.getByRole("button", { name: "Select Open URL" }));
    fireEvent.click(screen.getByRole("button", { name: "Set URL" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(screen.getByTestId("selected").textContent).toBe("open-url");
    expect(screen.getByTestId("url").textContent).toBe("https://example.com");
    expect(screen.getByTestId("edges").textContent).toBe("1");
    expect(screen.getByTestId("problems").textContent).toBe("0");
  });

  test("clears dirty state only after persistence succeeds", async () => {
    let saves = 0;
    render(
      <WorkflowEditorProvider
        initialGraph={initialGraph}
        onSave={async () => {
          saves += 1;
        }}
      >
        <EditorHarness />
      </WorkflowEditorProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add Open URL" }));
    fireEvent.click(screen.getByRole("button", { name: "Select Open URL" }));
    fireEvent.click(screen.getByRole("button", { name: "Set URL" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText("false", { selector: '[data-testid="dirty"]' });
    expect(saves).toBe(1);
  });

  test("replaces the editable graph only after approval", () => {
    render(<WorkflowEditorProvider initialGraph={initialGraph} onSave={async () => undefined}><EditorHarness /></WorkflowEditorProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Apply Approved" }));
    expect(screen.getByTestId("edges").textContent).toBe("1");
    expect(screen.getByTestId("dirty").textContent).toBe("false");
  });
});
