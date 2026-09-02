import "server-only";

import { createDatabasePool } from "@/lib/db/client";
import { createAuthoringRepository } from "./repository";
import { createAuthoringService } from "./service";

export function createConfiguredAuthoringService() {
  const pool = createDatabasePool();
  return {
    service: createAuthoringService({ repository: createAuthoringRepository(pool) }),
    close: () => pool.end(),
  };
}
