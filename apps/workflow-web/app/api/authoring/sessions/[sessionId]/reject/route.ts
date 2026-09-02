import { z } from "zod";

import { createConfiguredAuthoringService } from "@/features/authoring/server";
import { authoringError, authoringSuccess } from "../../../response";

const rejectSchema = z.object({ reason: z.string().trim().min(1).max(2_000) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const configured = createConfiguredAuthoringService();
  try {
    return authoringSuccess(await configured.service.reject(sessionId, rejectSchema.parse(await request.json()).reason));
  } catch (error) {
    return authoringError(error);
  } finally {
    await configured.close();
  }
}
