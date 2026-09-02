"use server";

import { redirect } from "next/navigation";

import type { WorkflowGraph } from "@/features/workflows/model/types";
import { createDatabasePool } from "@/lib/db/client";
import { createCatalogRepository } from "./repository";
import { createWorkflowDataSource, currentWorkflowDataMode } from "@/features/workflows/data/repository";

function requireLocalMode(): void {
  if (currentWorkflowDataMode() === "demo") throw new Error("Demo mode is read-only");
}

function required(formData: FormData, key: string): string {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

export async function createProjectAction(formData: FormData): Promise<void> {
  requireLocalMode();
  const pool = createDatabasePool();
  try {
    const project = await createCatalogRepository(pool).createProject(required(formData, "name"));
    redirect(`/projects?project=${project.id}`);
  } finally {
    await pool.end();
  }
}

export async function createFeatureAction(formData: FormData): Promise<void> {
  requireLocalMode();
  const projectId = required(formData, "projectId");
  const pool = createDatabasePool();
  try {
    await createCatalogRepository(pool).createFeature(projectId, required(formData, "name"));
    redirect(`/projects?project=${projectId}`);
  } finally {
    await pool.end();
  }
}

export async function createTestCaseAction(formData: FormData): Promise<void> {
  requireLocalMode();
  const projectId = required(formData, "projectId");
  const featureId = required(formData, "featureId");
  const pool = createDatabasePool();
  try {
    const testCase = await createCatalogRepository(pool).createTestCase(featureId, {
      name: required(formData, "name"),
      baseUrl: required(formData, "baseUrl"),
    });
    redirect(`/projects/${projectId}/features/${featureId}/test-cases/${testCase.id}`);
  } finally {
    await pool.end();
  }
}

export async function saveTestCaseGraphAction(testCaseId: string, graph: WorkflowGraph): Promise<void> {
  await createWorkflowDataSource().saveGraph(testCaseId, graph);
}
