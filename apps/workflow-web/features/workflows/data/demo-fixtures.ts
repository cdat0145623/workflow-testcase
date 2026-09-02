import type { CatalogTreeProject } from "@/features/catalog/types";
import type { WorkflowGraph } from "../model/types";

function graph(path: string, failing = false): WorkflowGraph {
  return {
    nodes: [
      { id: "start", type: "step", position: { x: 0, y: 80 }, data: { type: "start", kind: "trigger", title: "Start", values: {} } },
      { id: "open", type: "step", position: { x: 300, y: 80 }, data: { type: "open-url", kind: "action", title: "Open page", values: { url: `{{baseUrl}}${path}` } } },
      { id: "verify", type: "step", position: { x: 600, y: 80 }, data: { type: "expect-visible", kind: "action", title: failing ? "Missing element" : "Page is ready", values: { locatorStrategy: "test_id", locatorValue: failing ? "missing" : "page-ready" } } },
    ],
    edges: [
      { id: "start-open", source: "start", target: "open" },
      { id: "open-verify", source: "open", target: "verify" },
    ],
  };
}

export const demoCatalog: CatalogTreeProject[] = [
  {
    id: "demo-storefront",
    name: "Storefront",
    slug: "storefront",
    features: [
      {
        id: "demo-authentication",
        projectId: "demo-storefront",
        name: "Authentication",
        slug: "authentication",
        testCases: [
          { id: "demo-login-pass", featureId: "demo-authentication", name: "Login happy path", slug: "login-happy-path", baseUrl: "https://demo.example.com", graph: graph("/login") },
          { id: "demo-login-fail", featureId: "demo-authentication", name: "Invalid dashboard state", slug: "invalid-dashboard-state", baseUrl: "https://demo.example.com", graph: graph("/login", true) },
        ],
      },
    ],
  },
  {
    id: "demo-admin",
    name: "Admin portal",
    slug: "admin-portal",
    features: [
      {
        id: "demo-users",
        projectId: "demo-admin",
        name: "User management",
        slug: "user-management",
        testCases: [
          { id: "demo-user-search", featureId: "demo-users", name: "Search active user", slug: "search-active-user", baseUrl: "https://admin.example.com", graph: graph("/users") },
        ],
      },
    ],
  },
];
