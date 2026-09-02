import { z } from "zod";

import { storeAuthoringArtifact } from "@/features/authoring/artifacts";
import { createConfiguredAuthoringService } from "@/features/authoring/server";
import { authoringError, authoringSuccess } from "../../../response";

const metadataSchema = z.object({ label: z.string().trim().min(1).max(200) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const configured = createConfiguredAuthoringService();
  try {
    const snapshot = await configured.service.getSnapshot(sessionId);
    if (!snapshot) throw new Error("Authoring session not found");
    const form = await request.formData();
    const file = form.get("file");
    const metadata = metadataSchema.parse({ label: form.get("label") });
    if (!(file instanceof File)) throw new Error("An image file is required");
    const artifact = await storeAuthoringArtifact({
      root: process.env.ARTIFACTS_ROOT ?? "/artifacts",
      sessionId,
      bytes: new Uint8Array(await file.arrayBuffer()),
      mimeType: file.type,
      label: metadata.label,
    });
    return authoringSuccess(artifact, 201);
  } catch (error) {
    return authoringError(error);
  } finally {
    await configured.close();
  }
}
