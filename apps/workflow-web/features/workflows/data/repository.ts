import type { CatalogTreeProject, TestCaseSelection } from "@/features/catalog/types";
import type { WorkflowGraph } from "../model/types";
import { createDemoRepository } from "./demo-repository";
import { createLocalRepository } from "./local-repository";

export type WorkflowDataMode = "local" | "demo";

export interface WorkflowDataSource {
  readonly mode: WorkflowDataMode;
  listCatalog(): Promise<CatalogTreeProject[]>;
  getSelection(projectId: string, featureId: string, testCaseId: string): Promise<TestCaseSelection | undefined>;
  saveGraph(testCaseId: string, graph: WorkflowGraph): Promise<void>;
}

export function currentWorkflowDataMode(): WorkflowDataMode {
  return process.env.WORKFLOW_DATA_MODE === "demo" ? "demo" : "local";
}

export function createWorkflowDataSource(
  mode = currentWorkflowDataMode(),
  config: { databaseUrl?: string; workerUrl?: string } = {
    databaseUrl: process.env.DATABASE_URL,
    workerUrl: process.env.WORKFLOW_WORKER_URL,
  },
): WorkflowDataSource {
  if (mode === "demo") return createDemoRepository();
  if (!config.databaseUrl) throw new Error("DATABASE_URL is required in local mode");
  if (!config.workerUrl) throw new Error("WORKFLOW_WORKER_URL is required in local mode");
  return createLocalRepository(config.databaseUrl);
}
