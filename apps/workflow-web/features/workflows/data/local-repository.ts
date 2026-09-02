import { createCatalogRepository } from "@/features/catalog/repository";
import { createDatabasePool } from "@/lib/db/client";
import type { WorkflowDataSource } from "./repository";

export function createLocalRepository(databaseUrl: string): WorkflowDataSource {
  return {
    mode: "local",
    async listCatalog() {
      const pool = createDatabasePool(databaseUrl);
      try {
        const repository = createCatalogRepository(pool);
        const projects = await repository.listProjects();
        return await Promise.all(projects.map(async (project) => ({
          ...project,
          features: await Promise.all((await repository.listFeatures(project.id)).map(async (feature) => ({
            ...feature,
            testCases: await repository.listTestCases(feature.id),
          }))),
        })));
      } finally {
        await pool.end();
      }
    },
    async getSelection(projectId, featureId, testCaseId) {
      const pool = createDatabasePool(databaseUrl);
      try {
        const repository = createCatalogRepository(pool);
        const [project, feature, testCase] = await Promise.all([
          repository.getProject(projectId),
          repository.getFeature(featureId),
          repository.getTestCase(testCaseId),
        ]);
        return project && feature && testCase && feature.projectId === project.id && testCase.featureId === feature.id
          ? { project, feature, testCase }
          : undefined;
      } finally {
        await pool.end();
      }
    },
    async saveGraph(testCaseId, graph) {
      const pool = createDatabasePool(databaseUrl);
      try {
        const saved = await createCatalogRepository(pool).saveGraph(testCaseId, graph);
        if (!saved) throw new Error("Test case no longer exists");
      } finally {
        await pool.end();
      }
    },
  };
}
