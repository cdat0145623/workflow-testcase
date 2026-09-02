import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { searchSource } from "../src/source-search";
import { parseSourceWorkspaces, resolveSourcePath } from "../src/source-workspaces";

const temporaryRoots: string[] = [];

async function workspaceFixture() {
  const root = await mkdtemp(join(tmpdir(), "sendkit-authoring-"));
  temporaryRoots.push(root);
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "calendar.tsx"), [
    "export function filteredTasks(selectedUserId: string) {",
    "  const password = 'should-redact';",
    "  return tasks.filter((task) => task.userId === selectedUserId);",
    "}",
  ].join("\n"));
  await writeFile(join(root, ".env"), "TOKEN=must-not-be-read");
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("resolves a relative path within an allowlisted workspace", async () => {
  const root = await workspaceFixture();
  const workspaces = await parseSourceWorkspaces(JSON.stringify({ hcns: root }));

  expect(await resolveSourcePath(workspaces, "hcns", "src/calendar.tsx")).toBe(join(root, "src", "calendar.tsx"));
});

test("rejects traversal, absolute paths, unknown keys and symlink escapes", async () => {
  const root = await workspaceFixture();
  const outside = await mkdtemp(join(tmpdir(), "sendkit-outside-"));
  temporaryRoots.push(outside);
  await writeFile(join(outside, "secret.ts"), "export const secret = true;");
  await symlink(join(outside, "secret.ts"), join(root, "src", "escape.ts"));
  const workspaces = await parseSourceWorkspaces(JSON.stringify({ hcns: root }));

  await expect(resolveSourcePath(workspaces, "hcns", "../secret.ts")).rejects.toThrow("relative");
  await expect(resolveSourcePath(workspaces, "hcns", "/private/secret.ts")).rejects.toThrow("relative");
  await expect(resolveSourcePath(workspaces, "unknown", "src/calendar.tsx")).rejects.toThrow("Unknown source workspace");
  await expect(resolveSourcePath(workspaces, "hcns", "src/escape.ts")).rejects.toThrow("escapes");
});

test("searches allowlisted source with relative paths and redacted snippets", async () => {
  const root = await workspaceFixture();
  const workspaces = await parseSourceWorkspaces(JSON.stringify({ hcns: root }));

  const matches = await searchSource({
    workspaces,
    workspaceKey: "hcns",
    query: "password",
    runRg: async () => ({
      exitCode: 0,
      stderr: "",
      stdout: `${JSON.stringify({
        type: "match",
        data: {
          path: { text: `${root}/src/calendar.tsx` },
          lines: { text: "  const password = 'should-redact';\n" },
          line_number: 2,
        },
      })}\n`,
    }),
  });

  expect(matches).toHaveLength(1);
  expect(matches[0]).toMatchObject({ workspaceKey: "hcns", relativePath: "src/calendar.tsx", line: 2 });
  expect(matches[0]?.excerpt).not.toContain(root);
  expect(matches[0]?.excerpt).not.toContain("should-redact");
});
