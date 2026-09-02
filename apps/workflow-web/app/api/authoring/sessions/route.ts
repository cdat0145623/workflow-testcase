import { z } from "zod";

import { createConfiguredAuthoringService } from "@/features/authoring/server";
import { authoringError, authoringSuccess } from "../response";

const startSchema = z.object({
  testCaseId: z.string().uuid(),
  requirement: z.string().trim().min(1).max(2_000),
  riskLevel: z.enum(["read_only", "write", "destructive"]),
}).strict();

export async function POST(request: Request) {
  const configured = createConfiguredAuthoringService();
  try {
    return authoringSuccess(await configured.service.start(startSchema.parse(await request.json())), 201);
  } catch (error) {
    return authoringError(error);
  } finally {
    await configured.close();
  }
}
