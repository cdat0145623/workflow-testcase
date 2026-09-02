"use client";

import Link from "next/link";
import { ChevronDown, FlaskConical, FolderKanban, Layers3 } from "lucide-react";

import type { CatalogTreeProject } from "../types";
import { CreateFeatureDialog } from "./create-feature-dialog";
import { CreateProjectDialog } from "./create-project-dialog";
import { CreateTestCaseDialog } from "./create-test-case-dialog";

export type { CatalogTreeProject } from "../types";

export function CatalogSidebar({ projects, selectedTestCaseId }: { projects: CatalogTreeProject[]; selectedTestCaseId?: string }) {
  return (
    <aside aria-label="Projects and test cases" className="flex h-dvh w-72 shrink-0 flex-col border-r border-slate-800 bg-slate-950 text-slate-100">
      <div className="flex h-14 items-center gap-2 border-b border-slate-800 px-4">
        <FolderKanban aria-hidden="true" className="size-4 text-emerald-400" />
        <p className="text-sm font-semibold">Projects</p>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto p-2">
        {projects.length === 0 && <p className="px-2 py-6 text-center text-xs leading-5 text-slate-500">Create the first project to organize features and workflows.</p>}
        {projects.map((project) => (
          <details key={project.id} open className="group mb-2">
            <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-md px-2 text-xs font-semibold text-slate-300 hover:bg-slate-900">
              <ChevronDown aria-hidden="true" className="size-3.5 transition-transform group-not-open:-rotate-90" />
              <FolderKanban aria-hidden="true" className="size-4 text-slate-500" />
              <span className="truncate">{project.name}</span>
            </summary>
            <div className="ml-3 border-l border-slate-800 pl-2">
              {project.features.map((feature) => (
                <details key={feature.id} open className="group/feature">
                  <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-md px-2 text-xs text-slate-400 hover:bg-slate-900 hover:text-slate-200">
                    <ChevronDown aria-hidden="true" className="size-3 transition-transform group-not-open/feature:-rotate-90" />
                    <Layers3 aria-hidden="true" className="size-3.5" />
                    <span className="truncate">{feature.name}</span>
                  </summary>
                  <div className="ml-3 border-l border-slate-800 py-1 pl-2">
                    {feature.testCases.map((testCase) => (
                      <Link
                        key={testCase.id}
                        href={`/projects/${project.id}/features/${feature.id}/test-cases/${testCase.id}`}
                        aria-current={selectedTestCaseId === testCase.id ? "page" : undefined}
                        className="flex min-h-9 items-center gap-2 rounded-md px-2 text-xs text-slate-500 outline-none hover:bg-slate-900 hover:text-slate-200 focus-visible:ring-2 focus-visible:ring-sky-500 aria-[current=page]:bg-slate-800 aria-[current=page]:text-white"
                      >
                        <FlaskConical aria-hidden="true" className="size-3.5 shrink-0" />
                        <span className="truncate">{testCase.name}</span>
                      </Link>
                    ))}
                    <CreateTestCaseDialog projectId={project.id} featureId={feature.id} />
                  </div>
                </details>
              ))}
              <CreateFeatureDialog projectId={project.id} />
            </div>
          </details>
        ))}
      </nav>
      <div className="border-t border-slate-800 p-2">
        <CreateProjectDialog />
      </div>
    </aside>
  );
}
