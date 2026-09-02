import { workflowSchema, type Workflow, type WorkflowStep } from "@cwa-dev/sendkit-workflow-contract";

type ValueTree = Record<string, unknown>;

function resolveValue(path: string, variables: ValueTree): unknown {
  if (path in variables) return variables[path];
  return path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in current) return (current as ValueTree)[key];
    return undefined;
  }, variables);
}

export function interpolateValue(value: string, variables: ValueTree): string {
  return value.replace(/{{\s*([^{}\s]+)\s*}}/g, (token, path: string) => {
    const resolved = resolveValue(path, variables);
    return resolved === undefined ? token : String(resolved);
  });
}

function interpolateUnknown(value: unknown, variables: ValueTree): unknown {
  if (typeof value === "string") return interpolateValue(value, variables);
  if (Array.isArray(value)) return value.map((item) => interpolateUnknown(item, variables));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, interpolateUnknown(item, variables)]));
  }
  return value;
}

export function interpolateStep(step: WorkflowStep, variables: ValueTree): WorkflowStep {
  return interpolateUnknown(step, variables) as WorkflowStep;
}

export function assertValidWorkflow(input: unknown): Workflow {
  return workflowSchema.parse(input);
}
