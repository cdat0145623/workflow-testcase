import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";

import { CatalogSidebar, type CatalogTreeProject } from "./catalog-sidebar";

afterEach(cleanup);

const catalog: CatalogTreeProject[] = [
  {
    id: "project-a",
    name: "Project A",
    slug: "project-a",
    features: [
      {
        id: "feature-a",
        projectId: "project-a",
        name: "Authentication",
        slug: "authentication",
        testCases: [{ id: "case-a", featureId: "feature-a", name: "Login", slug: "login", baseUrl: "https://a.test", graph: { nodes: [], edges: [] } }],
      },
    ],
  },
  {
    id: "project-b",
    name: "Project B",
    slug: "project-b",
    features: [
      {
        id: "feature-b",
        projectId: "project-b",
        name: "Checkout",
        slug: "checkout",
        testCases: [{ id: "case-b", featureId: "feature-b", name: "Pay", slug: "pay", baseUrl: "https://b.test", graph: { nodes: [], edges: [] } }],
      },
    ],
  },
];

describe("CatalogSidebar", () => {
  test("keeps test cases under their actual project and feature", () => {
    render(<CatalogSidebar projects={catalog} />);

    expect(screen.getByRole("link", { name: "Login" }).getAttribute("href")).toBe(
      "/projects/project-a/features/feature-a/test-cases/case-a",
    );
    expect(screen.getByRole("link", { name: "Pay" }).getAttribute("href")).toBe(
      "/projects/project-b/features/feature-b/test-cases/case-b",
    );
  });

  test("does not fabricate cross-parent links", () => {
    render(<CatalogSidebar projects={catalog} />);
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).not.toContain("/projects/project-a/features/feature-b/test-cases/case-b");
    expect(hrefs).not.toContain("/projects/project-b/features/feature-a/test-cases/case-a");
  });
});
