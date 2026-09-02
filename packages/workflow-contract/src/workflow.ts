import { z } from "zod";

const valueLocatorSchema = z.object({
  strategy: z.enum(["test_id", "label", "name", "css", "xpath"]),
  value: z.string().min(1),
});

const roleLocatorSchema = z.object({
  strategy: z.literal("role"),
  role: z.string().min(1),
  name: z.string().min(1).optional(),
});

export const locatorSchema = z.union([valueLocatorSchema, roleLocatorSchema]);

const identifiedStepSchema = z.object({
  id: z.string().min(1),
  timeout: z.number().positive().optional(),
});
const locatedStepSchema = identifiedStepSchema.extend({ locator: locatorSchema });

export const workflowStepSchema = z.discriminatedUnion("type", [
  identifiedStepSchema.extend({ type: z.literal("open_url"), url: z.string().min(1) }),
  locatedStepSchema.extend({ type: z.literal("click") }),
  locatedStepSchema.extend({ type: z.literal("fill"), value: z.string() }),
  locatedStepSchema.extend({ type: z.literal("select"), option: z.union([z.string(), z.array(z.string())]) }),
  locatedStepSchema.extend({ type: z.literal("wait_for"), state: z.enum(["attached", "detached", "visible", "hidden"]).optional() }),
  locatedStepSchema.extend({ type: z.literal("expect_visible") }),
  locatedStepSchema.extend({ type: z.literal("expect_text"), text: z.string() }),
  identifiedStepSchema.extend({ type: z.literal("screenshot"), fullPage: z.boolean().optional() }),
]);

export const workflowSchema = z.object({
  workflowVersionId: z.string().min(1),
  steps: z.array(workflowStepSchema).min(1),
}).superRefine(({ steps }, context) => {
  const seen = new Set<string>();
  for (const step of steps) {
    if (seen.has(step.id)) {
      context.addIssue({ code: "custom", message: `Duplicate step id: ${step.id}` });
    }
    seen.add(step.id);
  }
});

export type Locator = z.infer<typeof locatorSchema>;
export type WorkflowStep = z.infer<typeof workflowStepSchema>;
export type Workflow = z.infer<typeof workflowSchema>;
