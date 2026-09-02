export const locatorStrategies = ["test_id", "role", "label", "name", "css", "xpath"] as const;
export type LocatorStrategy = (typeof locatorStrategies)[number];

export interface NodeFieldDefinition {
  key: string;
  label: string;
  required?: boolean;
}

export interface NodeDefinition {
  type: string;
  kind: "trigger" | "action";
  label: string;
  iconKey: string;
  fields: NodeFieldDefinition[];
  requiresLocator?: boolean;
}

export const nodeRegistry = {
  start: { type: "start", kind: "trigger", label: "Start", iconKey: "mouse-pointer", fields: [] },
  "open-url": { type: "open-url", kind: "action", label: "Open URL", iconKey: "globe", fields: [{ key: "url", label: "URL", required: true }] },
  click: { type: "click", kind: "action", label: "Click", iconKey: "pointer", fields: [], requiresLocator: true },
  fill: { type: "fill", kind: "action", label: "Fill", iconKey: "text-cursor-input", fields: [{ key: "value", label: "Value", required: true }], requiresLocator: true },
  select: { type: "select", kind: "action", label: "Select", iconKey: "list", fields: [{ key: "option", label: "Option", required: true }], requiresLocator: true },
  "wait-for": { type: "wait-for", kind: "action", label: "Wait For", iconKey: "clock", fields: [], requiresLocator: true },
  "expect-visible": { type: "expect-visible", kind: "action", label: "Expect Visible", iconKey: "eye", fields: [], requiresLocator: true },
  "expect-text": { type: "expect-text", kind: "action", label: "Expect Text", iconKey: "scan-text", fields: [{ key: "text", label: "Text", required: true }], requiresLocator: true },
  screenshot: { type: "screenshot", kind: "action", label: "Screenshot", iconKey: "camera", fields: [] },
} as const satisfies Record<string, NodeDefinition>;

export type NodeType = keyof typeof nodeRegistry;
