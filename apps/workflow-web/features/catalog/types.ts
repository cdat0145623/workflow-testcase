export interface ProjectRecord {
  id: string;
  name: string;
  slug: string;
  sourceWorkspaceKey?: string;
}

export interface FeatureRecord {
  id: string;
  projectId: string;
  name: string;
  slug: string;
}

export type StoredWorkflowGraph = WorkflowGraph;

export interface TestCaseRecord {
  id: string;
  featureId: string;
  name: string;
  slug: string;
  baseUrl: string;
  graph: StoredWorkflowGraph;
}

export interface CreateTestCaseInput {
  name: string;
  baseUrl: string;
}

export interface CatalogTreeFeature extends FeatureRecord {
  testCases: TestCaseRecord[];
}

export interface CatalogTreeProject extends ProjectRecord {
  features: CatalogTreeFeature[];
}

export interface TestCaseSelection {
  project: ProjectRecord;
  feature: FeatureRecord;
  testCase: TestCaseRecord;
}
import type { WorkflowGraph } from "@/features/workflows/model/types";
