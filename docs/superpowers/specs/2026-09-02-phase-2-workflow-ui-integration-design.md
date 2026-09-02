# Phase 2 — Workflow UI Integration Design

## Status

Approved in conversation on 2026-09-02.

## Goal

Move the useful workflow graph and run-console experience from `browser-automation-app` into SendKit, add Project → Feature → Test case organization, and connect the UI to the deterministic local worker completed in Phase 1.

Phase 2 must run end-to-end on the local Docker stack and must also build in a Vercel-safe demo mode that does not require a database or worker.

## Source ownership

- SendKit is the only source of truth after migration.
- `/Users/macos/Desktop/WorkSpace/FontEnd/browser-automation-app` is read-only reference material.
- No bidirectional synchronization is created.
- Only the required UI source and patterns are transferred; the donor application is not copied wholesale.

## Scope

### Included

- Next.js workflow web application under `apps/workflow-web`.
- Project, Feature and Test case navigation and persistence.
- One Test case equals one editable workflow.
- React Flow graph editor, toolbar, inspector and graph validation.
- Explicit Save, Run, Stop and Run again operations.
- Deterministic graph-to-worker-workflow mapping.
- Run history, live status polling, per-step output/error and local artifacts.
- Docker development mode with source bind mounts and Next.js hot reload.
- A repository-wide launcher usable from any directory after one-time installation.
- Vercel demo mode with seeded in-memory/static data and no external services.

### Excluded

- Agent-authored workflows and natural-language requirement analysis.
- Stagehand, Browserbase and Browserbase session replay.
- Trigger.dev, Liveblocks, Clerk, billing and Pro-plan gates.
- Sentry and production observability services.
- Supabase, cloud-to-local task dispatch and a public local worker endpoint.
- VPS agents, remote MCP and Telegram notifications.
- Multi-user collaboration and authentication.

These excluded capabilities belong to later phases and must not be installed as dormant dependencies in Phase 2.

## Reuse map

### Transfer with small path/style adjustments

- `features/workflows/components/workflow-shell.tsx`
- `features/workflows/components/console-panel.tsx`
- `features/workflows/components/step-node.tsx`
- `features/workflows/components/node-icon.tsx`
- Required `components/ui/*` primitives and global styling.
- The structure of `validate-graph.ts`, interpolation helpers and topological ordering.

### Transfer UI shape but replace external adapters

- `canvas.tsx`: replace Liveblocks Flow with React Flow controlled state.
- `right-sidebar.tsx`: remove Clerk/plan checks and call SendKit Save/Run/Cancel operations.
- `workflow-runs-provider.tsx`: replace Trigger.dev Realtime with worker-backed HTTP polling.
- `logs-panel.tsx`: map Phase 1 `TestRun` and `StepRun` records to console rows.
- `inspector-panel.tsx`: show output, error, screenshots, report and trace instead of Browserbase replay.
- workflow actions/data: replace Clerk organization scope, Trigger.dev tasks and Neon assumptions with SendKit catalog repositories and worker HTTP calls.

### Do not transfer

- `Room`, Liveblocks endpoints and Liveblocks configuration.
- Trigger.dev task definitions and Trigger.dev public tokens.
- Browserbase/Stagehand node executors and replay API.
- Clerk authentication pages, organization switcher and billing page.
- Agent, Act, Observe, Extract and Send Email nodes.

## Domain model

```text
Project
└── Feature
    └── TestCase (one deterministic workflow)
        ├── current editable graph
        ├── WorkflowVersion
        │   └── compiled deterministic workflow
        └── TestRun
            ├── StepRun
            └── Artifact
```

New catalog tables:

- `projects(id, name, slug, created_at, updated_at)`
- `features(id, project_id, name, slug, created_at, updated_at)`
- `test_cases(id, feature_id, name, base_url, graph, created_at, updated_at)`

Existing Phase 1 tables remain authoritative for execution. `workflow_versions` gains nullable `test_case_id`, `version_number` and `graph` columns. Existing acceptance records remain valid because the new relation is nullable.

Each Run operation validates and saves the editable graph, creates a new immutable workflow version, and then sends that compiled version to `POST /runs`. Replaying a previous run uses its immutable version rather than recompiling the current graph.

## Deterministic graph model

Phase 2 supports a linear workflow represented visually as a React Flow graph. Branching is rejected because the Phase 1 worker executes a flat ordered step array and does not define branch semantics.

Validation requires:

- exactly one Start node;
- at least one executable node;
- every executable node connected to the Start chain;
- no cycles;
- at most one incoming and one outgoing execution edge per node;
- required fields present;
- locator fields valid for the selected locator strategy.

Supported nodes map one-to-one to the worker contract:

| UI node | Worker step |
| --- | --- |
| Open URL | `open_url` |
| Click | `click` |
| Fill | `fill` |
| Select | `select` |
| Wait For | `wait_for` |
| Expect Visible | `expect_visible` |
| Expect Text | `expect_text` |
| Screenshot | `screenshot` |

The Start node is omitted during compilation. Graph ordering is deterministic and every node ID becomes the worker step ID.

## Application boundaries

### Workflow web

`apps/workflow-web` owns pages, React Flow state, catalog CRUD, graph persistence, worker client calls, run polling and artifact presentation.

The browser calls only same-origin Next.js routes/actions. The server-side worker client uses `WORKFLOW_WORKER_URL`; local Docker resolves it as `http://workflow-worker:8787`.

### Worker

The Phase 1 worker remains the execution authority. Phase 2 does not add hot reload to it. Worker source changes are limited to data/API behavior that cannot live cleanly in the web adapter.

### PostgreSQL

The existing SendKit PostgreSQL service stores both catalog and execution state. The local web application and worker use the same database but retain separate responsibilities.

### Artifacts

The web container mounts `.local-data/artifacts` read-only. A same-origin artifact route validates the run ID and relative path, prevents path traversal and serves only files below the run directory. Demo mode serves fixtures under `apps/workflow-web/public/demo-artifacts`.

## Run flow

```text
User clicks Run
  → UI validates graph
  → server saves graph and immutable WorkflowVersion
  → server calls worker POST /runs
  → UI receives runId immediately
  → UI polls run/step state while queued or running
  → graph nodes and console update
  → terminal state stops polling
  → user inspects output/error/screenshots/report/trace
```

Polling uses a one-second interval only while a run is `queued` or `running`. Historical runs are read from PostgreSQL when the test-case page loads.

## Local and demo data modes

`WORKFLOW_DATA_MODE=local`:

- PostgreSQL catalog and run history are real.
- Worker Run/Cancel operations are enabled.
- Artifacts are read from the local bind mount.

`WORKFLOW_DATA_MODE=demo`:

- Seeded Project, Feature, Test case, graph, run and artifact fixtures are used.
- Run produces a deterministic simulated status sequence for UI review only.
- No PostgreSQL, worker, secrets or public tunnel are required.
- A visible Demo badge prevents users from mistaking simulation for a real browser run.

Vercel uses demo mode in Phase 2. Real Vercel-to-local execution is Phase 4.

## Docker development workflow

- `workflow-worker` and `workflow-postgres` continue using the Phase 1 Compose stack.
- `workflow-web` uses `oven/bun:1.2.22-debian`, a source bind mount and a Docker-managed `node_modules` volume.
- Next.js development mode provides hot reload for web source.
- Editing web source does not rebuild the worker image.
- Dependency/lockfile or base-image changes require rebuilding only the affected web dependency environment.

A launcher named `skwf` resolves the absolute SendKit repository path and offers `dev`, `test`, `acceptance`, `status` and `stop`. Installation creates a user-owned symlink in `~/.local/bin`; modifying shell startup files requires explicit user approval during execution.

## Vercel boundary

Phase 2 must produce a successful production build with `WORKFLOW_DATA_MODE=demo`. Actual Vercel deployment, environment creation and external writes occur only when the user explicitly requests them.

## Acceptance criteria

- Local UI loads Project → Feature → Test case navigation.
- A graph copied from donor visual patterns can be edited and saved.
- Graph compiles only to the Phase 1 deterministic contract.
- Run, Cancel and Run again operate against the local worker.
- Graph nodes and run console reflect queued/running/terminal step states.
- Failure identifies the exact step and shows its error and screenshots.
- Report and trace can be opened/downloaded safely.
- Refresh restores graph and run history from PostgreSQL.
- Two test cases under different features do not mix graphs or runs.
- Web source hot reloads without rebuilding the worker image.
- No host `node_modules` is created.
- Vercel demo-mode production build succeeds without PostgreSQL or worker access.
- No Clerk, Liveblocks, Trigger.dev, Browserbase or Stagehand runtime dependency is introduced.

