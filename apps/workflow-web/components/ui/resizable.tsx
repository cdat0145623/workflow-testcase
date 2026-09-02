"use client";

import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "@/lib/utils";

export function ResizablePanelGroup({ className, ...props }: ResizablePrimitive.GroupProps) {
  return (
    <ResizablePrimitive.Group
      className={cn("flex h-full w-full aria-[orientation=vertical]:flex-col", className)}
      {...props}
    />
  );
}

export function ResizablePanel(props: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel {...props} />;
}

export function ResizableHandle({ className, ...props }: ResizablePrimitive.SeparatorProps) {
  return (
    <ResizablePrimitive.Separator
      className={cn(
        "relative z-10 flex w-px cursor-col-resize items-center justify-center bg-slate-800 outline-none after:absolute after:inset-y-0 after:w-2 focus-visible:bg-sky-500 aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:cursor-row-resize aria-[orientation=horizontal]:after:h-2 aria-[orientation=horizontal]:after:w-full",
        className,
      )}
      {...props}
    />
  );
}
