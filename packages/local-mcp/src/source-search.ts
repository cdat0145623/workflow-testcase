import { spawn } from "node:child_process";

import { relativeSourcePath, type SourceWorkspaces } from "./source-workspaces";

export interface SourceSearchMatch {
  workspaceKey: string;
  relativePath: string;
  line: number;
  symbol?: string;
  excerpt: string;
}

export interface RgResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type RgRunner = (command: string, args: string[]) => Promise<RgResult>;

const excludedGlobs = [
  "!.git/**",
  "!.env",
  "!.env.*",
  "!**/node_modules/**",
  "!**/.next/**",
  "!**/dist/**",
  "!**/build/**",
  "!**/*.pem",
  "!**/*.key",
];

const secretAssignment = /((?:password|passwd|token|api[_-]?key|cookie|authorization)\s*[=:]\s*)([^\s,;]+)/gi;

function redactExcerpt(value: string): string {
  return value.replace(secretAssignment, "$1[REDACTED]").trim().slice(0, 500);
}

function defaultRunRg(command: string, args: string[]): Promise<RgResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") reject(new Error("rg is required for source discovery. Install ripgrep on the local MCP machine."));
      else reject(error);
    });
    child.once("close", (exitCode) => resolveResult({ exitCode: exitCode ?? 1, stdout, stderr }));
  });
}

function readMatches({ stdout, workspaceKey, workspaces }: { stdout: string; workspaceKey: string; workspaces: SourceWorkspaces }): SourceSearchMatch[] {
  const matches: SourceSearchMatch[] = [];
  for (const line of stdout.split("\n")) {
    if (!line) continue;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (!record || typeof record !== "object") continue;
    const data = (record as { type?: unknown; data?: Record<string, unknown> });
    if (data.type !== "match" || !data.data) continue;
    const path = data.data.path as { text?: unknown } | undefined;
    const lines = data.data.lines as { text?: unknown } | undefined;
    const lineNumber = data.data.line_number;
    if (typeof path?.text !== "string" || typeof lines?.text !== "string" || typeof lineNumber !== "number") continue;
    matches.push({
      workspaceKey,
      relativePath: relativeSourcePath(workspaces, workspaceKey, path.text),
      line: lineNumber,
      excerpt: redactExcerpt(lines.text),
    });
  }
  return matches;
}

export async function searchSource({
  workspaces,
  workspaceKey,
  query,
  globs = [],
  limit = 50,
  runRg = defaultRunRg,
}: {
  workspaces: SourceWorkspaces;
  workspaceKey: string;
  query: string;
  globs?: string[];
  limit?: number;
  runRg?: RgRunner;
}): Promise<SourceSearchMatch[]> {
  const root = workspaces.get(workspaceKey);
  if (!root) throw new Error(`Unknown source workspace: ${workspaceKey}`);
  if (!query.trim() || query.length > 200) throw new Error("Source search query must be between 1 and 200 characters");
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("Source search limit must be between 1 and 50");
  if (globs.some((glob) => glob.length > 200 || glob.includes("..") || glob.startsWith("/"))) throw new Error("Source search glob is invalid");

  const args = ["--json", "--line-number", "--hidden", "--max-filesize", "1M", ...excludedGlobs.flatMap((glob) => ["--glob", glob]), ...globs.flatMap((glob) => ["--glob", glob]), "--", query, root];
  const result = await runRg("rg", args);
  if (result.exitCode !== 0 && result.exitCode !== 1) throw new Error(result.stderr.trim() || "rg source search failed");
  return readMatches({ stdout: result.stdout, workspaceKey, workspaces }).slice(0, limit);
}
