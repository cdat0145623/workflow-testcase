# Phase 2 Workflow UI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transfer the useful workflow graph and run-console experience from `browser-automation-app` into SendKit, organize it by Project → Feature → Test case, and connect it to the deterministic local worker.

**Architecture:** A new Next.js app under `apps/workflow-web` owns catalog CRUD, React Flow editing and same-origin adapters. It compiles a validated linear graph into the existing Phase 1 workflow contract, invokes the worker over HTTP, polls active runs, and serves local artifacts read-only. A demo adapter allows Vercel builds and UI review without PostgreSQL or a worker.

**Tech Stack:** Bun 1.2.22, TypeScript, Next.js 16, React 19, React Flow 12, Tailwind CSS 4, PostgreSQL 16, Drizzle ORM, Docker Compose, Phase 1 workflow worker and Playwright 1.55.1.

**Spec:** `docs/superpowers/specs/2026-09-02-phase-2-workflow-ui-integration-design.md`

## Global Constraints

- SendKit is the only source of truth; `browser-automation-app` is read-only reference material.
- Do not create a Git worktree.
- Do not create host `node_modules`; install and execute web dependencies inside Docker only.
- Do not commit, push, create a Pull Request or modify shell startup files without explicit user approval.
- Do not add Clerk, Liveblocks, Trigger.dev, Browserbase, Stagehand, Sentry or billing dependencies.
- Do not add agent authoring, cloud-to-local dispatch, Supabase, VPS, remote MCP or Telegram behavior.
- One Test case equals one workflow.
- Phase 2 workflows are linear; branching is rejected.
- Worker and PostgreSQL data remain project-specific to SendKit.
- Web source changes use hot reload and must not rebuild the worker image.
- Docker builds must remain scoped to the affected service and follow `AGENTS.md` foreground/cleanup rules.
- Vercel mode is a clearly labeled simulation; real Vercel-to-local execution belongs to Phase 4.

---

## File Map

### New application

- `apps/workflow-web/package.json`: web-only runtime and development dependencies.
- `apps/workflow-web/app/**`: Next.js pages and same-origin API routes.
- `apps/workflow-web/components/ui/**`: only donor UI primitives required by transferred workflow components.
- `apps/workflow-web/features/catalog/**`: Project/Feature/Test case navigation and CRUD.
- `apps/workflow-web/features/workflows/model/**`: graph types, node registry, validation and deterministic compilation.
- `apps/workflow-web/features/workflows/components/**`: transferred and adapted graph/run-console UI.
- `apps/workflow-web/features/workflows/data/**`: local and demo repository boundaries.
- `apps/workflow-web/features/workflows/runs/**`: worker client, status mapping and polling provider.
- `apps/workflow-web/public/demo-artifacts/**`: non-sensitive Vercel demo fixtures.

### Shared/runtime changes

- `apps/workflow-worker/sql/004_phase_2_catalog.sql`: catalog tables and workflow-version linkage.
- `packages/workflow-contract/src/ui.ts`: shared API DTOs for runs/history/artifacts; no React Flow dependency.
- `infra/docker-compose.workflow.yml`: web and web-acceptance profiles, source/artifact mounts and Docker-managed dependency volume.
- `scripts/skwf`: repository-root-aware launcher.
- `scripts/install-skwf`: one-time launcher installer that does not modify shell startup files.
- `README.md`: Phase 2 local/demo commands and ownership notes.

---

### Task 1: Scaffold the Docker-only Next.js application

**Files:**
- Create: `apps/workflow-web/package.json`
- Create: `apps/workflow-web/tsconfig.json`
- Create: `apps/workflow-web/next.config.ts`
- Create: `apps/workflow-web/postcss.config.mjs`
- Create: `apps/workflow-web/app/layout.tsx`
- Create: `apps/workflow-web/app/page.tsx`
- Create: `apps/workflow-web/app/globals.css`
- Create: `apps/workflow-web/lib/utils.ts`
- Modify: `bun.lock`
- Modify: `infra/docker-compose.workflow.yml`

**Interfaces:**
- Consumes: existing Bun workspace and Compose project `sendkit-workflow`.
- Produces: a `workflow-web` service on port `3000` with hot reload and no host dependency directory.

- [x] **Step 1: Add a minimal web smoke test**

Create `apps/workflow-web/tests/smoke.test.ts` that imports an exported `appMetadata` object and asserts `{ title: "SendKit Workflows" }`. This forces the scaffold to expose stable application metadata independently of rendering.

- [x] **Step 2: Run the test inside an ephemeral Bun container and verify failure**

Run from the SendKit root:

```bash
docker run --rm -v "$PWD:/workspace:ro" -w /workspace oven/bun:1.2.22-debian bun test apps/workflow-web/tests/smoke.test.ts
```

Expected: FAIL because `apps/workflow-web/app/metadata.ts` does not exist.

- [x] **Step 3: Add the workspace package and minimal app**

Use these scripts in `apps/workflow-web/package.json`:

```json
{
  "name": "@cwa-dev/sendkit-workflow-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --hostname 0.0.0.0 --port 3000",
    "build": "next build",
    "start": "next start --hostname 0.0.0.0 --port 3000",
    "test": "bun test tests features",
    "typecheck": "tsc --noEmit"
  }
}
```

Copy only the donor styling foundation required for Next.js, Tailwind, themes and `cn()`. Add `app/metadata.ts`:

```ts
export const appMetadata = { title: "SendKit Workflows" } as const
```

Use `appMetadata` from the root layout metadata export.

- [x] **Step 4: Add Docker hot reload**

Add a `workflow-web` profile/service using `oven/bun:1.2.22-debian`, repository bind mount `/workspace`, Docker-managed volume `/workspace/node_modules`, `WATCHPACK_POLLING=true`, port `3000`, and command:

```text
bun install --frozen-lockfile && bun run --filter @cwa-dev/sendkit-workflow-web dev
```

Do not add a web production Dockerfile in Phase 2.

- [x] **Step 5: Update the lockfile without creating host node_modules**

Run `bun install --lockfile-only` in an ephemeral Bun container with the repository mounted read-write. Verify that only `bun.lock` changes and no root/app `node_modules` exists on the host.

- [x] **Step 6: Verify the scaffold**

Run the web test and typecheck in Docker. Start only PostgreSQL, worker and web in a foreground Compose workflow with cleanup trap. Verify `http://localhost:3000` returns 200 and editing page copy triggers hot reload without rebuilding `sendkit-workflow-worker:slim-v1`.

- [x] **Step 7: Review checkpoint**

Report changed files, container state, tests and image impact. Do not commit unless the user explicitly approves.

---

### Task 2: Add catalog schema and repositories

**Files:**
- Create: `apps/workflow-worker/sql/004_phase_2_catalog.sql`
- Create: `apps/workflow-web/lib/db/client.ts`
- Create: `apps/workflow-web/lib/db/schema.ts`
- Create: `apps/workflow-web/features/catalog/types.ts`
- Create: `apps/workflow-web/features/catalog/repository.ts`
- Create: `apps/workflow-web/features/catalog/repository.test.ts`
- Modify: `apps/workflow-web/package.json`
- Modify: `bun.lock`

**Interfaces:**
- Produces: `CatalogRepository` with `listProjects()`, `createProject()`, `listFeatures(projectId)`, `createFeature()`, `listTestCases(featureId)`, `createTestCase()`, `getTestCase(id)` and `saveGraph(id, graph)`.
- Produces: catalog rows related to existing `workflow_versions` and `test_runs` without invalidating Phase 1 records.

- [x] **Step 1: Write repository contract tests**

Define exact records:

```ts
export interface ProjectRecord { id: string; name: string; slug: string }
export interface FeatureRecord { id: string; projectId: string; name: string; slug: string }
export interface TestCaseRecord {
  id: string
  featureId: string
  name: string
  baseUrl: string
  graph: WorkflowGraph
}
```

Test project isolation by creating two projects, features and test cases, then asserting each feature lists only its own test cases.

- [x] **Step 2: Verify repository tests fail**

Run the repository test against the SendKit PostgreSQL test database from Docker. Expected: FAIL because catalog tables/repository are absent.

- [x] **Step 3: Add migration 004**

Create UUID-keyed `projects`, `features` and `test_cases` tables with foreign keys using `ON DELETE CASCADE`, timestamps and unique slug constraints scoped to the parent. Add nullable columns to `workflow_versions`:

```sql
test_case_id UUID REFERENCES test_cases(id) ON DELETE SET NULL,
version_number INTEGER,
graph JSONB
```

Add a partial unique index on `(test_case_id, version_number)` where `test_case_id IS NOT NULL`. Make every statement rerunnable with `IF NOT EXISTS` or guarded PostgreSQL blocks.

- [x] **Step 4: Implement local catalog repository**

Use parameterized Drizzle queries. Slugs derive from lowercase names, collapse non-alphanumeric runs to `-`, trim separators, and append `-2`, `-3` within the same parent when needed.

- [x] **Step 5: Run migration and tests**

Build only the migration-bearing worker image, recreate only worker if required to apply migration, and keep PostgreSQL data. Run repository tests and verify Phase 1 acceptance records remain readable.

- [x] **Step 6: Verify database isolation**

Query PostgreSQL for foreign-key violations, duplicate scoped slugs and Phase 1 run counts. Expected: zero violations/duplicates and unchanged historical runs.

- [x] **Step 7: Review checkpoint**

Report the one worker-image rebuild caused by migration 004. Do not commit unless explicitly approved.

---

### Task 3: Build deterministic graph model and compiler

**Files:**
- Create: `apps/workflow-web/features/workflows/model/types.ts`
- Create: `apps/workflow-web/features/workflows/model/node-registry.ts`
- Create: `apps/workflow-web/features/workflows/model/validate-graph.ts`
- Create: `apps/workflow-web/features/workflows/model/compile-graph.ts`
- Create: `apps/workflow-web/features/workflows/model/compile-graph.test.ts`
- Create: `apps/workflow-web/features/workflows/model/validate-graph.test.ts`

**Interfaces:**
- Produces: `validateGraph(graph: WorkflowGraph): GraphProblem[]`.
- Produces: `compileGraph(input: { graph: WorkflowGraph; workflowVersionId: string }): Workflow` from `@cwa-dev/sendkit-workflow-contract`.
- Consumes: Phase 1 `Workflow`/`WorkflowStep` types.

- [x] **Step 1: Write validation tests**

Cover exactly one Start, no executable nodes, disconnected nodes, cycles, branching, merging, missing required values, unsupported locator strategy and a valid linear graph.

- [x] **Step 2: Write compiler tests**

Use a graph Start → Open URL → Fill → Click → Expect Visible → Screenshot. Assert Start is omitted, IDs are preserved, ordering follows edges and UI node names map to worker snake-case step types.

- [x] **Step 3: Verify tests fail**

Run only graph model tests in the web test container. Expected: imports/functions absent.

- [x] **Step 4: Define the deterministic registry**

Define only `start`, `open-url`, `click`, `fill`, `select`, `wait-for`, `expect-visible`, `expect-text` and `screenshot`. Each definition includes label, icon key, required fields and whether it requires a locator.

Represent locator values with:

```ts
type LocatorValues = {
  locatorStrategy: "test_id" | "role" | "label" | "name" | "css" | "xpath"
  locatorValue?: string
  locatorRole?: string
  locatorName?: string
}
```

- [x] **Step 5: Implement validation**

Traverse from Start, reject any node with more than one incoming/outgoing execution edge, verify every executable node is visited exactly once, and return stable `{ code, nodeId?, message }` problems.

- [x] **Step 6: Implement compilation**

Follow the single outgoing edge from Start. Map node values to contract fields, preserve interpolation tokens, parse positive timeout strings to numbers, and validate the final object through `workflowSchema.parse()` before returning.

- [x] **Step 7: Run tests and contract tests**

Expected: graph validation/compiler tests and existing workflow-contract tests all pass. No worker image build is required.

- [x] **Step 8: Review checkpoint**

Review type names against the Phase 1 contract and report unsupported graph shapes explicitly.

---

### Task 4: Transfer the workflow editor without cloud dependencies

**Files:**
- Create: `apps/workflow-web/features/workflows/components/workflow-shell.tsx`
- Create: `apps/workflow-web/features/workflows/components/canvas.tsx`
- Create: `apps/workflow-web/features/workflows/components/right-sidebar.tsx`
- Create: `apps/workflow-web/features/workflows/components/step-node.tsx`
- Create: `apps/workflow-web/features/workflows/components/node-icon.tsx`
- Create: `apps/workflow-web/features/workflows/components/workflow-editor-provider.tsx`
- Create: `apps/workflow-web/features/workflows/components/workflow-editor.test.tsx`
- Create/modify: required `apps/workflow-web/components/ui/*`

**Interfaces:**
- Consumes: `WorkflowGraph`, deterministic `nodeRegistry`, `validateGraph` and catalog `saveGraph`.
- Produces: controlled `WorkflowEditorProvider` exposing `{ graph, isDirty, save, getGraph }`.

- [x] **Step 1: Write editor behavior tests**

Test adding an Open URL node, selecting it, editing URL, connecting it after Start, validation feedback, Save clearing dirty state, and no Liveblocks/Clerk imports in the dependency graph.

- [x] **Step 2: Verify tests fail**

Run only editor tests. Expected: components absent.

- [x] **Step 3: Transfer the visual shell**

Copy the donor resizable canvas/console/sidebar composition and required UI primitives. Preserve visual behavior and responsive minimum sizes; update import aliases to the new app.

- [x] **Step 4: Replace Liveblocks state**

Implement Canvas with React Flow controlled nodes/edges from `WorkflowEditorProvider`. Use `onNodesChange`, `onEdgesChange`, `onConnect` and `onDelete`; remove cursors, avatars, rooms and Liveblocks CSS.

- [x] **Step 5: Adapt toolbar and inspector**

Use the deterministic registry. Remove premium locks and plan hooks. Keep single-Start protection, viewport-centered insertion, selected-node editing and upstream token chips.

- [x] **Step 6: Add explicit Save state**

Show Save disabled when clean, show an unsaved indicator when dirty, validate before persistence, and preserve unsaved state if save fails.

- [x] **Step 7: Run editor tests and typecheck**

Expected: tests pass, no external cloud dependency imports are present, and TypeScript has no React Flow generic errors.

- [x] **Step 8: Visual review**

Run the web service and compare canvas, node, toolbar/editor and resizable panel behavior against donor design images. Record screenshots under `.local-data/phase-2-review`; do not copy them into source unless requested.

- [x] **Step 9: Review checkpoint**

Report donor files reused, adapter replacements and any intentional visual deviations.

---

### Task 5: Add Project, Feature and Test case navigation

**Files:**
- Create: `apps/workflow-web/app/projects/page.tsx`
- Create: `apps/workflow-web/app/projects/[projectId]/features/[featureId]/test-cases/[testCaseId]/page.tsx`
- Create: `apps/workflow-web/features/catalog/components/catalog-sidebar.tsx`
- Create: `apps/workflow-web/features/catalog/components/create-project-dialog.tsx`
- Create: `apps/workflow-web/features/catalog/components/create-feature-dialog.tsx`
- Create: `apps/workflow-web/features/catalog/components/create-test-case-dialog.tsx`
- Create: `apps/workflow-web/features/catalog/components/catalog-sidebar.test.tsx`
- Modify: `apps/workflow-web/app/page.tsx`

**Interfaces:**
- Consumes: `CatalogRepository` and `WorkflowEditorProvider`.
- Produces: stable URL identity for each selected Project/Feature/Test case.

- [x] **Step 1: Write navigation tests**

Seed two projects with features/test cases. Assert expansion and selection never show records from another parent, and test-case links include all three IDs.

- [x] **Step 2: Verify tests fail**

Run catalog component tests. Expected: sidebar/dialogs absent.

- [x] **Step 3: Transfer and adapt donor sidebar primitives**

Reuse sidebar collapse, workflow-nav list and new-workflow interaction patterns. Replace Organization with Project, nested workflow groups with Features, and workflow rows with Test cases.

- [x] **Step 4: Implement create flows**

Create Project, Feature and Test case dialogs with required trimmed names. New test cases start with Start plus one Open URL node and empty edges so the editor immediately communicates what must be connected.

- [x] **Step 5: Implement route loading**

Load and validate the full parent chain. Return not-found when IDs exist but do not belong to each other. Pass the selected test case graph/base URL into the editor.

- [x] **Step 6: Run navigation and repository tests**

Expected: all catalog tests pass and cross-project isolation is enforced in both route and repository layers.

- [x] **Step 7: Review checkpoint**

Review the one-workflow-per-test-case terminology and URL structure with the user.

---

### Task 6: Connect Save, Run, Cancel and Run again to the Phase 1 worker

**Files:**
- Create: `apps/workflow-web/features/workflows/runs/types.ts`
- Create: `apps/workflow-web/features/workflows/runs/worker-client.ts`
- Create: `apps/workflow-web/features/workflows/runs/run-service.ts`
- Create: `apps/workflow-web/features/workflows/runs/workflow-runs-provider.tsx`
- Create: `apps/workflow-web/features/workflows/runs/run-service.test.ts`
- Create: `apps/workflow-web/app/api/runs/route.ts`
- Create: `apps/workflow-web/app/api/runs/[runId]/route.ts`
- Create: `apps/workflow-web/app/api/runs/[runId]/cancel/route.ts`
- Modify: `apps/workflow-web/features/workflows/components/right-sidebar.tsx`

**Interfaces:**
- Produces: `startTestCaseRun(testCaseId)`, `cancelRun(runId)`, `replayRun(runId)` and `getRun(runId)`.
- Produces: `WorkflowRunsProvider` with normalized lower-case Phase 1 statuses.
- Consumes: compiler, catalog/version persistence and worker `POST /runs`, `GET /runs/:id`, `POST /runs/:id/cancel`.

- [x] **Step 1: Write run-service tests**

Test that Run validates/saves graph, inserts an immutable incremented version, posts the exact compiled workflow, returns queued immediately, redacts variables from persisted execution state, and does not create a version when validation fails.

- [x] **Step 2: Write polling tests**

Use fake timers and responses `queued → running → passed`. Assert one-second polling occurs only while active and stops on `passed`, `failed`, `cancelled`, unmount or unrecoverable 404.

- [x] **Step 3: Verify tests fail**

Run run-service/provider tests. Expected: services absent.

- [x] **Step 4: Implement the server-side worker client**

Read `WORKFLOW_WORKER_URL`, reject missing configuration in local mode, use JSON timeouts, preserve worker error messages, and never expose the worker URL to browser JavaScript.

- [x] **Step 5: Implement immutable Run and replay semantics**

Run compiles current graph into a new version. Run again loads the selected historical `workflow_versions.workflow` JSON and posts it unchanged with the test case's current base URL and supplied variables.

- [x] **Step 6: Implement polling provider**

Normalize worker run/step records for graph node status and console consumers. Keep historical runs from server-loaded initial data and merge updates by run ID.

- [x] **Step 7: Connect Run and Stop buttons**

Retain donor button behavior but call same-origin routes. Disable duplicate Run while an active run exists for the selected test case and show actionable toast messages on network/validation errors.

- [x] **Step 8: Run service/provider tests and Phase 1 API tests**

Expected: new tests and all existing worker server/service tests pass. Build worker only if worker source changed; API adapter changes alone rebuild nothing.

- [x] **Step 9: Review checkpoint**

Demonstrate queued response timing, active polling, cancellation and version-stable replay.

---

### Task 7: Transfer the run console and add safe artifact viewing

**Files:**
- Create: `apps/workflow-web/features/workflows/components/console-panel.tsx`
- Create: `apps/workflow-web/features/workflows/components/logs-panel.tsx`
- Create: `apps/workflow-web/features/workflows/components/inspector-panel.tsx`
- Create: `apps/workflow-web/features/workflows/components/artifact-viewer.tsx`
- Create: `apps/workflow-web/features/workflows/components/run-console.test.tsx`
- Create: `apps/workflow-web/app/api/artifacts/[runId]/[...path]/route.ts`
- Create: `apps/workflow-web/app/api/artifacts/artifact-route.test.ts`
- Modify: `infra/docker-compose.workflow.yml`

**Interfaces:**
- Consumes: normalized runs from `WorkflowRunsProvider` and read-only `ARTIFACTS_ROOT`.
- Produces: selectable run/step rows and safe screenshot/report/trace/log URLs.

- [x] **Step 1: Write console mapping tests**

Cover queued/running/passed/failed/cancelled runs; passed/failed/skipped steps; failed-step error rendering; screenshot selection; Run again; and no Browserbase replay/Pro lock rendering.

- [x] **Step 2: Write artifact route security tests**

Assert valid run-relative files are served with correct content types. Reject `..`, encoded traversal, absolute paths, unknown run IDs and symlink escapes with 400/404 without revealing filesystem paths.

- [x] **Step 3: Verify tests fail**

Run console and artifact-route tests. Expected: components/routes absent.

- [x] **Step 4: Transfer console UI**

Reuse donor selection model and resizable layout. Change `nodeId` references to worker `stepId` where appropriate and map `passed` instead of donor `done`.

- [x] **Step 5: Replace session replay**

Inspector shows step output/error and before/after screenshots. Run-level selection exposes report, trace and log actions. Remove Browserbase session IDs, replay component and billing hooks.

- [x] **Step 6: Implement safe artifact serving**

Resolve the requested path below `${ARTIFACTS_ROOT}/${runId}`, compare canonical paths, disallow symlinks and stream with an allowlist for PNG, JSON, HTML, ZIP and plain text.

- [x] **Step 7: Mount artifacts read-only**

Mount `../.local-data/artifacts:/artifacts:ro` into web and set `ARTIFACTS_ROOT=/artifacts`. Do not expose the host path in API responses.

- [x] **Step 8: Run tests and inspect real Phase 1 artifacts**

Use an acceptance run containing screenshots, report, trace and log. Verify all allowed artifacts open and traversal probes fail.

- [x] **Step 9: Review checkpoint**

Demonstrate the exact failed step and its before/after screenshots in the transferred console.

---

### Task 8: Add Vercel-safe demo mode

**Files:**
- Create: `apps/workflow-web/features/workflows/data/repository.ts`
- Create: `apps/workflow-web/features/workflows/data/local-repository.ts`
- Create: `apps/workflow-web/features/workflows/data/demo-repository.ts`
- Create: `apps/workflow-web/features/workflows/data/demo-fixtures.ts`
- Create: `apps/workflow-web/features/workflows/data/repository.test.ts`
- Create: `apps/workflow-web/components/demo-badge.tsx`
- Create: `apps/workflow-web/public/demo-artifacts/failed-before.png`
- Create: `apps/workflow-web/public/demo-artifacts/failed-after.png`
- Create: `apps/workflow-web/.env.example`
- Modify: relevant catalog/run server loaders and actions.

**Interfaces:**
- Produces: `createWorkflowDataSource(mode: "local" | "demo"): WorkflowDataSource`.
- Demo implementation returns the same DTOs as local mode without opening PostgreSQL or worker connections.

- [x] **Step 1: Write mode-boundary tests**

Set demo mode with invalid database/worker URLs and assert pages/data still load. Assert local mode fails fast with a configuration error when either required URL is missing.

- [x] **Step 2: Verify tests fail**

Run repository mode tests. Expected: factory absent.

- [x] **Step 3: Extract the data-source interface**

Include catalog reads/writes, graph save, run start/cancel/replay, history and artifact URL generation. Return serializable DTOs only.

- [x] **Step 4: Implement deterministic demo fixtures**

Provide at least two projects, two features, three test cases, one passing run and one failed run. Simulated Run emits queued/running/passed states in-memory for visual review and always displays a Demo badge.

- [x] **Step 5: Add non-sensitive demo artifacts**

Generate simple fixture screenshots owned by this repository; do not copy user data or Phase 1 local screenshots into deployable source.

- [x] **Step 6: Verify demo production build**

Run inside Docker:

```bash
WORKFLOW_DATA_MODE=demo bun run --filter @cwa-dev/sendkit-workflow-web build
```

Expected: build succeeds with network access to neither PostgreSQL nor worker.

- [x] **Step 7: Verify local mode remains real**

Run a real test case and assert its worker-generated run ID is not a demo ID and its artifacts come from `.local-data`.

- [x] **Step 8: Review checkpoint**

Report that Phase 2 is Vercel-previewable but real Vercel-to-local Run remains intentionally unavailable until Phase 4.

---

### Task 9: Add the global launcher and operational documentation

**Files:**
- Create: `scripts/skwf`
- Create: `scripts/install-skwf`
- Create: `scripts/skwf.test.sh`
- Modify: `README.md`
- Modify: `apps/workflow-web/.env.example`

**Interfaces:**
- Produces: `skwf dev|test|acceptance|status|stop` callable outside the repository after one-time symlink installation.

- [x] **Step 1: Write launcher tests**

Run the launcher from a temporary unrelated directory with a stubbed `docker` executable. Assert it resolves the SendKit root, passes the fixed Compose project/file, rejects unknown commands and never uses caller-relative paths.

- [x] **Step 2: Verify tests fail**

Run `bash scripts/skwf.test.sh`. Expected: launcher absent.

- [x] **Step 3: Implement `scripts/skwf`**

Resolve repository root relative to the script's real path. Commands:

```text
dev        foreground PostgreSQL + worker + web with cleanup trap
test       web/contract/worker tests in Docker
acceptance local UI acceptance profile
status     Compose ps plus web/worker health
stop       stop this Compose project's services without deleting volumes
```

Do not use `down --volumes`, broad Docker prune or hard-coded current directory assumptions.

- [x] **Step 4: Implement one-time installer**

Create `~/.local/bin` if absent and symlink `skwf` there. Print exact PATH instructions if `~/.local/bin` is not already present. Do not edit `.zshrc`, `.zprofile` or another shell file automatically.

- [x] **Step 5: Run launcher tests**

Expected: tests pass from both SendKit root and an unrelated directory.

- [x] **Step 6: Update documentation**

Document first-time installation, local/demo environment variables, hot reload behavior, when worker/web builds are required, artifact location, clean stop and the Vercel demo boundary.

- [x] **Step 7: Review checkpoint**

Do not install the symlink or modify the user's PATH until the user explicitly approves that machine-level action.

---

### Task 10: End-to-end acceptance and Phase 2 handoff

**Files:**
- Create: `apps/workflow-web/tests/acceptance/run-ui-acceptance.mjs`
- Create: `apps/workflow-web/tests/acceptance/fixtures.ts`
- Modify: `infra/docker-compose.workflow.yml`
- Modify: `docs/superpowers/plans/2026-09-02-phase-2-workflow-ui-integration.md` (check completed items only after evidence exists)

**Interfaces:**
- Consumes: complete local stack, real worker API, PostgreSQL and artifact mount.
- Produces: repeatable Docker-only Phase 2 acceptance with no host dependencies.

- [x] **Step 1: Add a UI acceptance profile using the existing worker image**

Reuse `sendkit-workflow-worker:slim-v1` as the Playwright-capable test runner with the acceptance script mounted below `/app/ui-tests`. Do not build or download another browser image.

- [x] **Step 2: Implement catalog/editor acceptance**

Through the browser, create Project A/Feature A/Test case A and Project B/Feature B/Test case B. Edit and save distinct graphs, refresh, and assert each graph remains isolated.

- [x] **Step 3: Implement execution acceptance**

Run a passing login workflow, observe queued/running/passed, inspect step output/screenshots and open report/trace. Run a bad-locator workflow, assert the exact failed step and skipped remainder, then Run again from the successful immutable version.

- [x] **Step 4: Implement cancellation acceptance**

Start a delayed workflow, click Stop while active and assert the UI and database finish as cancelled without creating another run.

- [x] **Step 5: Implement security and persistence acceptance**

Refresh run history, attempt artifact traversal URLs, query duplicate step rows and plaintext test secrets, and assert all invariants remain clean.

- [x] **Step 6: Run the complete verification matrix**

Run contract tests, worker tests, web unit/component tests, TypeScript checks, local UI acceptance and demo production build. Capture exact pass counts and command output.

- [x] **Step 7: Verify Docker/image impact**

Confirm only current SendKit containers/images remain, PostgreSQL is healthy, no host `node_modules` exists, web source hot reload does not rebuild worker and no donor container/image/data was recreated.

- [x] **Step 8: Phase 2 handoff**

Report source artifacts, runtime URLs, acceptance artifacts, Vercel demo build output, remaining Phase 3/4/5 boundaries and all uncommitted files. Do not deploy, commit, push or create a PR without explicit user instruction.
