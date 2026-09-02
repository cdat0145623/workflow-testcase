import { z } from "zod";

import { approveAuthoringSession } from "@/features/authoring/approval-service";
import { createDatabasePool } from "@/lib/db/client";
import { authoringError, authoringSuccess } from "../../../response";

const approvalSchema = z.object({ expectedUpdatedAt: z.string().datetime({ offset: true }) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const pool = createDatabasePool();
  try {
    const { expectedUpdatedAt } = approvalSchema.parse(await request.json());
    return authoringSuccess(await approveAuthoringSession({ pool, sessionId, expectedUpdatedAt }));
  } catch (error) {
    return authoringError(error);
  } finally {
    await pool.end();
  }
}
