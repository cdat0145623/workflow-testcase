import { notFound } from "next/navigation";

import { saveTestCaseGraphAction } from "@/features/catalog/actions";
import { CatalogSidebar } from "@/features/catalog/components/catalog-sidebar";
import { loadCatalogTree } from "@/features/catalog/load-catalog";
import { WorkflowShell } from "@/features/workflows/components/workflow-shell";
import { createWorkflowDataSource } from "@/features/workflows/data/repository";
import { createConfiguredAuthoringService } from "@/features/authoring/server";

export const dynamic = "force-dynamic";

export default async function TestCasePage({
  params,
}: {
  params: Promise<{ projectId: string; featureId: string; testCaseId: string }>;
}) {
  const { projectId, featureId, testCaseId } = await params;
  const source = createWorkflowDataSource();
  const selection = await source.getSelection(projectId, featureId, testCaseId);
  if (!selection) notFound();
  const testCase = selection.testCase;

  const projects = await loadCatalogTree();
  const saveGraph = saveTestCaseGraphAction.bind(null, testCaseId);
  let authoringSnapshot;
  if (source.mode === "local") {
    const configured = createConfiguredAuthoringService();
    try {
      const [latest] = await configured.service.listSnapshots(testCaseId);
      authoringSnapshot = latest;
    } finally {
      await configured.close();
    }
  }

  return (
    <main className="flex h-dvh overflow-hidden bg-slate-950">
      <CatalogSidebar projects={projects} selectedTestCaseId={testCaseId} />
      <div className="min-w-0 flex-1">
        <WorkflowShell testCaseId={testCase.id} testCaseName={testCase.name} initialGraph={testCase.graph} onSave={saveGraph} demo={source.mode === "demo"} authoringSnapshot={authoringSnapshot} sourceWorkspaceKey={selection.project.sourceWorkspaceKey} />
      </div>
    </main>
  );
}
