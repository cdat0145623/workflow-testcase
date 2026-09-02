import type { CatalogTreeProject } from "./types";
import { createWorkflowDataSource } from "@/features/workflows/data/repository";

export async function loadCatalogTree(): Promise<CatalogTreeProject[]> {
  return createWorkflowDataSource().listCatalog();
}
