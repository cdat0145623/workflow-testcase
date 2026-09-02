import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export type SourceWorkspaces = Map<string, string>;

const workspaceKeyPattern = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

function isSafeRelativePath(relativePath: string): boolean {
  return relativePath.length > 0
    && !isAbsolute(relativePath)
    && !relativePath.split(/[\\/]+/).some((segment) => segment === ".." || segment.length === 0);
}

function staysWithin(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

export async function parseSourceWorkspaces(raw: string): Promise<SourceWorkspaces> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("SENDKIT_SOURCE_WORKSPACES must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("SENDKIT_SOURCE_WORKSPACES must be an object mapping keys to roots");
  }

  const entries = await Promise.all(Object.entries(parsed).map(async ([key, value]) => {
    if (!workspaceKeyPattern.test(key)) throw new Error(`Invalid source workspace key: ${key}`);
    if (typeof value !== "string" || !isAbsolute(value)) throw new Error(`Source workspace ${key} must use an absolute root path`);
    return [key, await realpath(value)] as const;
  }));
  return new Map(entries);
}

export async function resolveSourcePath(workspaces: SourceWorkspaces, workspaceKey: string, relativePath: string): Promise<string> {
  const root = workspaces.get(workspaceKey);
  if (!root) throw new Error(`Unknown source workspace: ${workspaceKey}`);
  if (!isSafeRelativePath(relativePath)) throw new Error("Source path must be relative and cannot traverse outside its workspace");

  const candidate = await realpath(resolve(root, relativePath));
  if (!staysWithin(root, candidate)) throw new Error(`Source path escapes workspace: ${workspaceKey}`);
  return candidate;
}

export function relativeSourcePath(workspaces: SourceWorkspaces, workspaceKey: string, absolutePath: string): string {
  const root = workspaces.get(workspaceKey);
  if (!root) throw new Error(`Unknown source workspace: ${workspaceKey}`);
  const result = relative(root, absolutePath).split(sep).join("/");
  if (!isSafeRelativePath(result)) throw new Error(`Source path escapes workspace: ${workspaceKey}`);
  return result;
}
