import { createConfiguredAuthoringService } from "@/features/authoring/server";
import { authoringError, authoringSuccess } from "../../response";

export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const configured = createConfiguredAuthoringService();
  try {
    const snapshot = await configured.service.getSnapshot(sessionId);
    if (!snapshot) throw new Error("Authoring session not found");
    return authoringSuccess(snapshot);
  } catch (error) {
    return authoringError(error);
  } finally {
    await configured.close();
  }
}
