import { createConfiguredAuthoringService } from "@/features/authoring/server";
import { authoringError, authoringSuccess } from "../../../response";

export async function POST(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const configured = createConfiguredAuthoringService();
  try {
    return authoringSuccess(await configured.service.cancel(sessionId));
  } catch (error) {
    return authoringError(error);
  } finally {
    await configured.close();
  }
}
