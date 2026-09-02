import { CatalogSidebar } from "@/features/catalog/components/catalog-sidebar";
import { loadCatalogTree } from "@/features/catalog/load-catalog";
import { DemoBadge } from "@/components/demo-badge";
import { currentWorkflowDataMode } from "@/features/workflows/data/repository";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await loadCatalogTree();
  const isDemo = currentWorkflowDataMode() === "demo";
  return (
    <main className="flex h-dvh overflow-hidden bg-slate-950 text-slate-100">
      <CatalogSidebar projects={projects} />
      <section className="grid min-w-0 flex-1 place-items-center p-8">
        <div className="max-w-md text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">Workflow workspace</p>
          <div className="mt-3 flex items-center justify-center gap-3"><h1 className="text-2xl font-semibold">Choose a test case</h1>{isDemo && <DemoBadge />}</div>
          <p className="mt-2 text-sm leading-6 text-slate-500">Each test case owns one deterministic workflow. Choose one in the sidebar or create a new project.</p>
        </div>
      </section>
    </main>
  );
}
