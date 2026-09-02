import { demoCatalog } from "./demo-fixtures";
import type { WorkflowDataSource } from "./repository";

export function createDemoRepository(): WorkflowDataSource {
  return {
    mode: "demo",
    async listCatalog() { return structuredClone(demoCatalog); },
    async getSelection(projectId, featureId, testCaseId) {
      const project = demoCatalog.find((item) => item.id === projectId);
      const feature = project?.features.find((item) => item.id === featureId);
      const testCase = feature?.testCases.find((item) => item.id === testCaseId);
      return project && feature && testCase ? { project, feature, testCase: structuredClone(testCase) } : undefined;
    },
    async saveGraph() {
      // Demo mode is intentionally ephemeral and read-only across requests.
    },
  };
}
