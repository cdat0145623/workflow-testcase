import {
  Camera,
  Clock3,
  Eye,
  Globe2,
  ListChecks,
  MousePointer2,
  ScanText,
  TextCursorInput,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { nodeRegistry, type NodeType } from "../model/node-registry";

const icons: Record<string, LucideIcon> = {
  camera: Camera,
  clock: Clock3,
  eye: Eye,
  globe: Globe2,
  list: ListChecks,
  "mouse-pointer": MousePointer2,
  pointer: MousePointer2,
  "scan-text": ScanText,
  "text-cursor-input": TextCursorInput,
};

const accents: Record<NodeType, string> = {
  start: "bg-violet-500/15 text-violet-300 ring-violet-500/25",
  "open-url": "bg-sky-500/15 text-sky-300 ring-sky-500/25",
  click: "bg-blue-500/15 text-blue-300 ring-blue-500/25",
  fill: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/25",
  select: "bg-indigo-500/15 text-indigo-300 ring-indigo-500/25",
  "wait-for": "bg-amber-500/15 text-amber-300 ring-amber-500/25",
  "expect-visible": "bg-emerald-500/15 text-emerald-300 ring-emerald-500/25",
  "expect-text": "bg-teal-500/15 text-teal-300 ring-teal-500/25",
  screenshot: "bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-500/25",
};

export function NodeIcon({ type, className }: { type: NodeType; className?: string }) {
  const Icon = icons[nodeRegistry[type].iconKey] ?? MousePointer2;
  return (
    <span
      aria-hidden="true"
      className={cn("flex size-7 shrink-0 items-center justify-center rounded-md ring-1", accents[type], className)}
    >
      <Icon className="size-4" strokeWidth={1.8} />
    </span>
  );
}
