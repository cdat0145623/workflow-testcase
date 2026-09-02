import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import type { StoredWorkflowGraph } from "@/features/catalog/types";
import type {
  AuthoringDiagnostic,
  AuthoringEventInput,
  AuthoringRiskLevel,
  AuthoringSessionStatus,
  AuthoringSourceStatus,
} from "@cwa-dev/sendkit-workflow-contract";

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    sourceWorkspaceKey: text("source_workspace_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("projects_slug_unique").on(table.slug)],
);

export const features = pgTable(
  "features",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("features_project_slug_unique").on(table.projectId, table.slug)],
);

export const testCases = pgTable(
  "test_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    featureId: uuid("feature_id").notNull().references(() => features.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    baseUrl: text("base_url").notNull(),
    graph: jsonb("graph").$type<StoredWorkflowGraph>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("test_cases_feature_slug_unique").on(table.featureId, table.slug)],
);

export const authoringSessions = pgTable("authoring_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  testCaseId: uuid("test_case_id").notNull().references(() => testCases.id, { onDelete: "cascade" }),
  requirement: text("requirement").notNull(),
  status: text("status").$type<AuthoringSessionStatus>().notNull(),
  riskLevel: text("risk_level").$type<AuthoringRiskLevel>().notNull(),
  sourceStatus: text("source_status").$type<AuthoringSourceStatus>().notNull(),
  draftGraph: jsonb("draft_graph").$type<StoredWorkflowGraph | null>(),
  diagnostics: jsonb("diagnostics").$type<AuthoringDiagnostic[]>().notNull(),
  approvedWorkflowVersionId: text("approved_workflow_version_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const authoringEvents = pgTable("authoring_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => authoringSessions.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  kind: text("kind").notNull(),
  payload: jsonb("payload").$type<AuthoringEventInput["payload"]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
