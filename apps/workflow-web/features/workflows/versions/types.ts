import type { Workflow } from "@cwa-dev/sendkit-workflow-contract";
import type { WorkflowGraph } from "../model/types";

export interface WorkflowVersionSummary { id: string; testCaseId: string; versionNumber: number; createdAt: string; stepCount: number; latestRun?: { id: string; status: string; createdAt: string }; }
export interface WorkflowVersionDetail extends WorkflowVersionSummary { graph: WorkflowGraph; workflow: Workflow; }
