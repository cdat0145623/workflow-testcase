"use client";

import { useState } from "react";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { InspectorPanel } from "./inspector-panel";
import { LogsPanel, type ConsoleSelection } from "./logs-panel";

export function ConsolePanel() {
  const [selected, setSelected] = useState<ConsoleSelection | null>(null);
  return (
    <ResizablePanelGroup orientation="horizontal" className="size-full bg-slate-950">
      <ResizablePanel minSize="14rem">
        <LogsPanel selected={selected} onSelect={(next) => setSelected((current) => JSON.stringify(current) === JSON.stringify(next) ? null : next)} />
      </ResizablePanel>
      {selected && (
        <>
          <ResizableHandle />
          <ResizablePanel defaultSize="26rem" minSize="18rem">
            <InspectorPanel selection={selected} />
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}
