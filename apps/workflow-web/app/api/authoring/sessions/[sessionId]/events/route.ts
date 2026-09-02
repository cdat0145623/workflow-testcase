import { authoringEventInputSchema } from "@cwa-dev/sendkit-workflow-contract";

import { createConfiguredAuthoringService } from "@/features/authoring/server";
import { authoringError, authoringSuccess } from "../../../response";

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const configured = createConfiguredAuthoringService();
  try {
    return authoringSuccess(await configured.service.appendEvent(sessionId, authoringEventInputSchema.parse(await request.json())), 201);
  } catch (error) {
    return authoringError(error);
  } finally {
    await configured.close();
  }
}
