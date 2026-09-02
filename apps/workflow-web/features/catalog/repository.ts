import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";

import { features, projects, testCases } from "@/lib/db/schema";
import type {
  CreateTestCaseInput,
  FeatureRecord,
  ProjectRecord,
  StoredWorkflowGraph,
  TestCaseRecord,
} from "./types";

const initialGraph: StoredWorkflowGraph = {
  nodes: [
    {
      id: "start",
      type: "step",
      position: { x: 0, y: 0 },
      data: { type: "start", kind: "trigger", title: "Start", values: {} },
    },
    {
      id: "open-url",
      type: "step",
      position: { x: 320, y: 0 },
      data: { type: "open-url", kind: "action", title: "Open URL 1", values: { url: "{{baseUrl}}" } },
    },
  ],
  edges: [],
};

function baseSlug(value: string): string {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "untitled";
}

function nextSlug(value: string, existing: string[]): string {
  const base = baseSlug(value);
  const used = new Set(existing);
  if (!used.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

function projectRecord(row: typeof projects.$inferSelect): ProjectRecord {
  return { id: row.id, name: row.name, slug: row.slug, ...(row.sourceWorkspaceKey ? { sourceWorkspaceKey: row.sourceWorkspaceKey } : {}) };
}

function featureRecord(row: typeof features.$inferSelect): FeatureRecord {
  return { id: row.id, projectId: row.projectId, name: row.name, slug: row.slug };
}

function testCaseRecord(row: typeof testCases.$inferSelect): TestCaseRecord {
  return {
    id: row.id,
    featureId: row.featureId,
    name: row.name,
    slug: row.slug,
    baseUrl: row.baseUrl,
    graph: row.graph,
  };
}

export interface CatalogRepository {
  listProjects(): Promise<ProjectRecord[]>;
  getProject(id: string): Promise<ProjectRecord | undefined>;
  createProject(name: string): Promise<ProjectRecord>;
  setSourceWorkspaceKey(projectId: string, key: string): Promise<ProjectRecord>;
  listFeatures(projectId: string): Promise<FeatureRecord[]>;
  getFeature(id: string): Promise<FeatureRecord | undefined>;
  createFeature(projectId: string, name: string): Promise<FeatureRecord>;
  listTestCases(featureId: string): Promise<TestCaseRecord[]>;
  createTestCase(featureId: string, input: CreateTestCaseInput): Promise<TestCaseRecord>;
  getTestCase(id: string): Promise<TestCaseRecord | undefined>;
  saveGraph(id: string, graph: StoredWorkflowGraph): Promise<TestCaseRecord | undefined>;
}

export function createCatalogRepository(pool: pg.Pool): CatalogRepository {
  const db = drizzle(pool);

  return {
    async listProjects() {
      return (await db.select().from(projects).orderBy(asc(projects.createdAt))).map(projectRecord);
    },
    async getProject(id) {
      const [row] = await db.select().from(projects).where(eq(projects.id, id));
      return row ? projectRecord(row) : undefined;
    },
    async createProject(name) {
      const existing = await db.select({ slug: projects.slug }).from(projects);
      const [row] = await db.insert(projects).values({ name: name.trim(), slug: nextSlug(name, existing.map((item) => item.slug)) }).returning();
      return projectRecord(row!);
    },
    async setSourceWorkspaceKey(projectId, key) {
      const normalized = key.trim();
      if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(normalized)) throw new Error("source workspace key is invalid");
      const [row] = await db.update(projects).set({ sourceWorkspaceKey: normalized, updatedAt: new Date() }).where(eq(projects.id, projectId)).returning();
      if (!row) throw new Error("Project not found");
      return projectRecord(row);
    },
    async listFeatures(projectId) {
      return (await db.select().from(features).where(eq(features.projectId, projectId)).orderBy(asc(features.createdAt))).map(featureRecord);
    },
    async getFeature(id) {
      const [row] = await db.select().from(features).where(eq(features.id, id));
      return row ? featureRecord(row) : undefined;
    },
    async createFeature(projectId, name) {
      const existing = await db.select({ slug: features.slug }).from(features).where(eq(features.projectId, projectId));
      const [row] = await db.insert(features).values({ projectId, name: name.trim(), slug: nextSlug(name, existing.map((item) => item.slug)) }).returning();
      return featureRecord(row!);
    },
    async listTestCases(featureId) {
      return (await db.select().from(testCases).where(eq(testCases.featureId, featureId)).orderBy(asc(testCases.createdAt))).map(testCaseRecord);
    },
    async createTestCase(featureId, input) {
      const existing = await db.select({ slug: testCases.slug }).from(testCases).where(eq(testCases.featureId, featureId));
      const [row] = await db.insert(testCases).values({
        featureId,
        name: input.name.trim(),
        slug: nextSlug(input.name, existing.map((item) => item.slug)),
        baseUrl: input.baseUrl,
        graph: initialGraph,
      }).returning();
      return testCaseRecord(row!);
    },
    async getTestCase(id) {
      const [row] = await db.select().from(testCases).where(eq(testCases.id, id));
      return row ? testCaseRecord(row) : undefined;
    },
    async saveGraph(id, graph) {
      const [row] = await db.update(testCases).set({ graph, updatedAt: new Date() }).where(and(eq(testCases.id, id))).returning();
      return row ? testCaseRecord(row) : undefined;
    },
  };
}
