# Runtime Values, Workflow Versions and Run History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:test-driven-development` for every behavior change and `superpowers:verification-before-completion` before reporting completion.

**Goal:** Persist one current runtime-value preset per test case, expose immutable workflow versions and persisted run history in the UI, and let an old version be restored into the editable draft without mutating history.

**Architecture:** PostgreSQL remains the source of truth. Runtime values are scoped by `testCaseId`; password is encrypted server-side with AES-256-GCM while non-secret values remain plaintext for this internal-only version. A new Run atomically stores the preset, creates an immutable version and saves the current graph before dispatching the existing deterministic worker. Replaying a version stores the current preset but executes that exact immutable version. Restore is client-side draft replacement followed by an explicit Save.

**Tech Stack:** Bun 1.2.22, TypeScript 6, Next.js 16, React 19, PostgreSQL 16, Drizzle ORM, React Flow 12, Docker Compose, existing Playwright workflow worker.

**Design spec:** `docs/superpowers/specs/2026-09-02-runtime-values-version-history-design.md`

## Global Constraints

- SendKit is the only repository to modify. Do not copy changes back to `browser-automation-app`.
- Do not create a Git worktree.
- Do not install or modify host `node_modules`.
- Do not build or recreate a Docker image/container until the user explicitly permits the specific build checkpoint.
- Preserve the existing PostgreSQL volume; never use `down --volumes` for this work.
- Do not commit, push, create a Pull Request or merge unless the user explicitly requests it.
- Web source uses the existing hot-reload mount. Web-only changes do not trigger an image build.
- Migration 006 is baked into the worker image. Stop at Task 4's Docker checkpoint before rebuilding only the worker image and applying the migration.
- Do not deploy, access or mutate HCNS production in automated acceptance.
- Do not add UI-to-agent dispatch, heartbeat, queue, VPS, Telegram, Supabase or remote MCP behavior.
- Do not persist plaintext passwords in PostgreSQL, run variables, logs, errors, screenshots or artifacts.
- Password display in the Run dialog is allowed only for this internal version. Public deployment is blocked until authentication and authorization exist.
- Any proposed commit commands in this plan are bookkeeping checkpoints only; execute them only after explicit user authorization.

## Delivery Flow

```text
Open test case
  → load editable graph + current runtime preset
  → Run validates only referenced variables
  → encrypt password
  → transaction: upsert preset + create immutable version + save graph
  → queue deterministic worker
  → persist and display run history

Versions
  → view immutable graph
  → run exact immutable version with current preset
  → or copy graph into dirty draft
  → explicit Save
  → next Run creates vN+1
```

## File Map

### Runtime variables and encryption

- Create: `apps/workflow-web/features/workflows/runtime-values/types.ts`
- Create: `apps/workflow-web/features/workflows/runtime-values/field-registry.ts`
- Create: `apps/workflow-web/features/workflows/runtime-values/field-registry.test.ts`
- Create: `apps/workflow-web/features/workflows/runtime-values/crypto.ts`
- Create: `apps/workflow-web/features/workflows/runtime-values/crypto.test.ts`
- Create: `apps/workflow-web/features/workflows/runtime-values/repository.ts`
- Create: `apps/workflow-web/features/workflows/runtime-values/repository.test.ts`
- Create: `apps/workflow-web/features/workflows/runtime-values/service.ts`
- Create: `apps/workflow-web/features/workflows/runtime-values/service.test.ts`
- Create: `apps/workflow-web/app/api/test-cases/[testCaseId]/runtime-values/route.ts`

### Persistence and run transaction

- Create: `apps/workflow-worker/sql/006_runtime_values_and_history.sql`
- Modify: `apps/workflow-web/lib/db/schema.ts`
- Create: `apps/workflow-web/features/workflows/runs/run-persistence.ts`
- Create: `apps/workflow-web/features/workflows/runs/run-persistence.test.ts`
- Modify: `apps/workflow-web/features/workflows/runs/run-service.ts`
- Modify: `apps/workflow-web/features/workflows/runs/run-service-server.ts`
- Modify: `apps/workflow-web/features/workflows/runs/run-service.test.ts`
- Modify: `apps/workflow-web/app/api/runs/route.ts`

### Runtime-value UI

- Create: `apps/workflow-web/features/workflows/runtime-values/use-runtime-values.ts`
- Modify: `apps/workflow-web/features/workflows/components/run-variables-dialog.tsx`
- Modify: `apps/workflow-web/features/workflows/components/run-variables-dialog.test.tsx`
- Modify: `apps/workflow-web/features/workflows/components/right-sidebar.tsx`
- Modify: `apps/workflow-web/features/workflows/components/inspector-panel.tsx`
- Modify: `apps/workflow-web/features/workflows/runs/workflow-runs-provider.tsx`
- Modify: `apps/workflow-web/features/workflows/runs/workflow-runs-provider.test.tsx`

### Versions

- Create: `apps/workflow-web/features/workflows/versions/repository.ts`
- Create: `apps/workflow-web/features/workflows/versions/repository.test.ts`
- Create: `apps/workflow-web/features/workflows/versions/types.ts`
- Create: `apps/workflow-web/app/api/test-cases/[testCaseId]/versions/route.ts`
- Create: `apps/workflow-web/app/api/workflow-versions/[versionId]/route.ts`
- Create: `apps/workflow-web/app/api/workflow-versions/[versionId]/runs/route.ts`
- Create: `apps/workflow-web/features/workflows/versions/versions-panel.tsx`
- Create: `apps/workflow-web/features/workflows/versions/versions-panel.test.tsx`
- Create: `apps/workflow-web/features/workflows/versions/version-graph-viewer.tsx`
- Modify: `apps/workflow-web/features/workflows/components/workflow-editor-provider.tsx`
- Modify: `apps/workflow-web/features/workflows/components/workflow-editor.test.tsx`
- Modify: `apps/workflow-web/features/workflows/components/workflow-shell.tsx`

### Run history

- Create: `apps/workflow-web/features/workflows/runs/run-history-repository.ts`
- Create: `apps/workflow-web/features/workflows/runs/run-history-repository.test.ts`
- Create: `apps/workflow-web/app/api/test-cases/[testCaseId]/runs/route.ts`
- Create: `apps/workflow-web/features/workflows/runs/runs-history-panel.tsx`
- Create: `apps/workflow-web/features/workflows/runs/runs-history-panel.test.tsx`
- Modify: `apps/workflow-web/features/workflows/runs/types.ts`
- Modify: `apps/workflow-web/features/workflows/components/console-panel.tsx`
- Modify: `apps/workflow-web/features/workflows/components/workflow-shell.tsx`

### Configuration, acceptance and docs

- Modify: `apps/workflow-web/.env.example`
- Modify: `infra/docker-compose.workflow.yml`
- Create: `apps/workflow-web/tests/acceptance/run-runtime-history-acceptance.mjs`
- Modify: `scripts/skwf`
- Modify: `scripts/skwf.test.sh`
- Modify: `README.md`

---

### Task 1: Discover graph-aware runtime fields

**Files:**
- Create: `apps/workflow-web/features/workflows/runtime-values/types.ts`
- Create: `apps/workflow-web/features/workflows/runtime-values/field-registry.ts`
- Create: `apps/workflow-web/features/workflows/runtime-values/field-registry.test.ts`

**Public interface:**

```ts
export type PersistedRuntimeKey = "username" | "password" | "taskTitle" | "assigneeName"

export interface RuntimeFieldDefinition {
  key: string
  label: string
  sensitive: boolean
  persistedKey?: PersistedRuntimeKey
  required: true
}

export interface RuntimeValuesInput {
  username?: string
  password?: string
  taskTitle?: string
  assigneeName?: string
  [key: string]: string | undefined
}

export function extractRuntimeFields(graph: WorkflowGraph): RuntimeFieldDefinition[]
export function normalizeAndValidateRuntimeValues(
  fields: RuntimeFieldDefinition[],
  input: RuntimeValuesInput,
): { values: Record<string, string>; persisted: Record<PersistedRuntimeKey, string> }
```

- [ ] **Step 1: Write failing unit tests**

Cover recursive placeholder discovery in node values, de-duplication in first-use order, `password` and `secret.login_password` mapping to the same persisted password, exclusion of `baseUrl`, and generic required fields for unknown placeholders.

Add validation cases proving that referenced known fields are required, `taskTitle` and `assigneeName` are trimmed, unreferenced fields are ignored, and field failures carry a stable map such as `{ taskTitle: "Task title is required" }`.

- [ ] **Step 2: Confirm RED inside the existing test container**

Run:

```bash
skwf test
```

Expected: focused imports or assertions fail because the registry is not implemented. No image build.

- [ ] **Step 3: Implement placeholder extraction and validation**

Recognize `{{name}}` tokens anywhere in string node values. Canonicalize `secret.login_password` to `password` for persistence while preserving the original placeholder key in the variables sent to the worker. Do not infer fields that the graph does not reference.

- [ ] **Step 4: Confirm GREEN**

Run `skwf test`. Expected: registry tests and existing workflow compiler tests pass.

**Proposed commit after authorization:** `feat(workflow): add graph-aware runtime field registry`

---

### Task 2: Add the AES-256-GCM password boundary

**Files:**
- Create: `apps/workflow-web/features/workflows/runtime-values/crypto.ts`
- Create: `apps/workflow-web/features/workflows/runtime-values/crypto.test.ts`
- Modify: `apps/workflow-web/.env.example`
- Modify: `infra/docker-compose.workflow.yml`

**Public interface:**

```ts
export class RuntimeSecretConfigurationError extends Error {}
export class RuntimeSecretDecryptionError extends Error {}

export function encryptRuntimePassword(plaintext: string, encodedKey?: string): string
export function decryptRuntimePassword(envelope: string, encodedKey?: string): string
```

- [ ] **Step 1: Write failing crypto tests**

Prove round-trip decryption, a random 12-byte IV on every encryption, different ciphertext for identical plaintext, rejection of a key that does not decode to exactly 32 bytes, authentication failure with the wrong key, malformed-envelope failure and empty-string round trip.

- [ ] **Step 2: Implement the server-only envelope**

Use `node:crypto` with `aes-256-gcm`. Encode as `v1.<iv-base64url>.<tag-base64url>.<ciphertext-base64url>`. Read `WORKFLOW_RUNTIME_SECRET_KEY` only inside server code. Error messages must not include key material, plaintext or ciphertext.

- [ ] **Step 3: Configure local and acceptance environments**

Document a 32-byte base64 key in `.env.example`. In Compose, pass the key to the web service from the host environment; acceptance may use a fixed non-production test key. Do not pass the key to the worker service.

- [ ] **Step 4: Verify**

Run `skwf test`. Search the diff and test output for fixture plaintext outside the crypto unit test. Expected: crypto tests pass and the web container remains hot-reloaded.

**Proposed commit after authorization:** `feat(workflow): encrypt persisted runtime passwords`

---

### Task 3: Add migration 006 and runtime-value persistence

**Files:**
- Create: `apps/workflow-worker/sql/006_runtime_values_and_history.sql`
- Modify: `apps/workflow-web/lib/db/schema.ts`
- Create: `apps/workflow-web/features/workflows/runtime-values/repository.ts`
- Create: `apps/workflow-web/features/workflows/runtime-values/repository.test.ts`

**Repository interface:**

```ts
export interface RuntimeValuesStoredRecord {
  testCaseId: string
  username: string
  passwordCiphertext: string
  taskTitle: string
  assigneeName: string
  updatedAt: string
}

export interface RuntimeValuesWrite {
  username: string
  passwordCiphertext: string
  taskTitle: string
  assigneeName: string
}

get(testCaseId: string): Promise<RuntimeValuesStoredRecord | undefined>
upsert(testCaseId: string, values: RuntimeValuesWrite, client?: pg.PoolClient): Promise<RuntimeValuesStoredRecord>
```

- [ ] **Step 1: Write migration and repository tests first**

Tests must prove one row per test case, repeated upsert overwrites the same row, cascade delete, project/test-case isolation, and absence of plaintext password in every text/JSON column queried by the test.

- [ ] **Step 2: Add idempotent migration SQL**

Create `test_case_runtime_values` exactly as approved. Add indexes only if absent:

```sql
CREATE INDEX IF NOT EXISTS workflow_versions_test_case_number_idx
  ON workflow_versions(test_case_id, version_number DESC);

CREATE INDEX IF NOT EXISTS test_runs_workflow_version_created_idx
  ON test_runs(workflow_version_id, created_at DESC);
```

- [ ] **Step 3: Add the Drizzle schema and raw PostgreSQL repository**

Support an optional transaction client so Task 5 can upsert and create a version in one transaction. Never decrypt inside the repository.

- [ ] **Step 4: Run non-migration tests**

Run `skwf test`. Expected: pure/schema tests pass; database integration tests remain blocked until migration 006 is applied.

**Proposed commit after authorization:** `feat(workflow): persist one runtime preset per test case`

---

### Task 4: Mandatory Docker-impact checkpoint and migration verification

**Docker scope:** `migrate` only. Migration 006 is baked into the existing workflow-worker image; web source itself remains hot-reloaded.

- [ ] **Step 1: Inspect the exact Compose project state**

Run read-only checks:

```bash
docker compose -p sendkit-workflow -f infra/docker-compose.workflow.yml ps -a
docker image inspect sendkit-workflow-worker:slim-v1
```

Report which web, worker and PostgreSQL containers are running or stopped. Do not infer from image presence.

- [ ] **Step 2: Report before build**

Report changed migration/schema files, scope `migrate`, worker image as the only image to rebuild, migration 006 as the only migration to apply, current web port, PostgreSQL volume name, and that the volume is preserved.

- [ ] **Step 3: Stop and obtain explicit build permission**

Do not build from plan approval alone. Wait for a separate explicit instruction permitting this worker-image rebuild.

- [ ] **Step 4: Run one foreground build/migrate workflow after permission**

Use one shell command with `trap`, no `-d`, no `--no-cache`, and no volume removal. It must rebuild only `workflow-worker`, run the migrate service, keep required services in the foreground for verification, and execute `docker compose stop` on Ctrl-C/exit.

- [ ] **Step 5: Verify migration 006**

Query `information_schema`, index definitions and migration logs. Then run repository integration tests proving upsert and encryption storage behavior.

Expected: existing PostgreSQL data remains present, migration is idempotent, and no unrelated service image is rebuilt.

---

### Task 5: Build the runtime-values service and API

**Files:**
- Create: `apps/workflow-web/features/workflows/runtime-values/service.ts`
- Create: `apps/workflow-web/features/workflows/runtime-values/service.test.ts`
- Create: `apps/workflow-web/app/api/test-cases/[testCaseId]/runtime-values/route.ts`

**Service interface:**

```ts
getForGraph(testCaseId: string, graph: WorkflowGraph): Promise<{
  fields: RuntimeFieldDefinition[]
  values: Record<string, string>
}>

prepareForPersistence(testCaseId: string, graph: WorkflowGraph, input: RuntimeValuesInput): Promise<{
  workerVariables: Record<string, string>
  storedValues: RuntimeValuesWrite
}>
```

- [ ] **Step 1: Write failing service and route tests**

Cover no preset yet, decrypt/prefill, graph-aware field list, unknown field not persisted, invalid key, wrong-key authentication failure, field-level 422 response, missing test case 404 and repository failure 500 without secret leakage.

- [ ] **Step 2: Implement GET**

`GET /api/test-cases/:testCaseId/runtime-values` loads the test case graph, discovers fields, decrypts the current password and returns only the values required by the graph. Unknown placeholders have empty values.

- [ ] **Step 3: Implement PUT**

`PUT` accepts graph-aware values, validates, encrypts and upserts one row. Keep it available for explicit preset editing, while normal Run uses the transaction path in Task 6.

- [ ] **Step 4: Verify**

Run `skwf test`. Confirm API responses never contain `passwordCiphertext`, IV or auth tag.

**Proposed commit after authorization:** `feat(workflow): expose encrypted runtime preset API`

---

### Task 6: Make Run persistence atomic before worker dispatch

**Files:**
- Create: `apps/workflow-web/features/workflows/runs/run-persistence.ts`
- Create: `apps/workflow-web/features/workflows/runs/run-persistence.test.ts`
- Modify: `apps/workflow-web/features/workflows/runs/run-service.ts`
- Modify: `apps/workflow-web/features/workflows/runs/run-service-server.ts`
- Modify: `apps/workflow-web/features/workflows/runs/run-service.test.ts`
- Modify: `apps/workflow-web/app/api/runs/route.ts`

**Persistence boundary:**

```ts
prepareNewRun(input: {
  testCaseId: string
  graph: WorkflowGraph
  workflow: Workflow
  storedValues: RuntimeValuesWrite
}): Promise<{ testCase: TestCaseRecord; version: WorkflowVersionRecord }>

prepareVersionReplay(input: {
  workflowVersionId: string
  storedValues: RuntimeValuesWrite
}): Promise<{ testCase: TestCaseRecord; version: WorkflowVersionRecord }>
```

- [ ] **Step 1: Extend run-service tests before implementation**

Prove this order for a new run: validate/prepare values, transaction upsert, immutable version creation, editable graph save, commit, worker dispatch. If validation/encryption/upsert/version/graph save fails, no worker request occurs. If the worker fails after commit, the preset and version remain.

For replay, prove preset upsert occurs, the exact stored workflow is dispatched, and no new version is created.

- [ ] **Step 2: Implement one PostgreSQL transaction**

For new Run, acquire the existing test-case advisory lock and atomically upsert runtime values, calculate `MAX(version_number)+1`, insert the immutable version and update `test_cases.graph`. Commit before calling the worker.

For Run this version/Run again, load and lock the version's test case, upsert runtime values and commit without inserting a version or changing the editable graph.

- [ ] **Step 3: Return stable API errors**

Use 422 with `{ fieldErrors }` for referenced-variable failures, 404 for missing test case/version, 503 for worker unavailability and 500 for persistence/configuration errors. Keep the dialog open on every failure.

- [ ] **Step 4: Verify run redaction**

Run `skwf test` and worker acceptance. Query the resulting `test_runs.variables`; every submitted value must remain `[REDACTED]`.

**Proposed commit after authorization:** `feat(workflow): atomically persist presets and workflow versions`

---

### Task 7: Make the Run dialog dynamic, prefilled and durable

**Files:**
- Create: `apps/workflow-web/features/workflows/runtime-values/use-runtime-values.ts`
- Modify: `apps/workflow-web/features/workflows/components/run-variables-dialog.tsx`
- Modify: `apps/workflow-web/features/workflows/components/run-variables-dialog.test.tsx`
- Modify: `apps/workflow-web/features/workflows/components/right-sidebar.tsx`
- Modify: `apps/workflow-web/features/workflows/components/inspector-panel.tsx`
- Modify: `apps/workflow-web/features/workflows/runs/workflow-runs-provider.tsx`
- Modify: `apps/workflow-web/features/workflows/runs/workflow-runs-provider.test.tsx`

- [ ] **Step 1: Write component tests first**

Cover loading state, only referenced fields rendered, values prefilled after reload, password displayed as clear text as explicitly approved, inline required errors, focus on first invalid field, generic unknown field, disabled submit while loading/running, API error retaining all typed values, successful close, and reopening with the just-saved preset.

- [ ] **Step 2: Change the dialog contract**

Accept `testCaseId`, graph or immutable-version field definitions, and an async `onRun`. Fetch the preset only when opening. Do not call `close()` until `await onRun(values)` succeeds.

- [ ] **Step 3: Connect normal Run, Run again and version replay**

Normal Run uses the editable graph. Run again uses the selected run's immutable version field definitions. Both display the one current preset owned by the test case.

- [ ] **Step 4: Verify**

Run `skwf test`; manually open, cancel, reopen, submit, reload and reopen. Confirm there is only one runtime-values row and its `updated_at` changes.

**Proposed commit after authorization:** `feat(workflow): prefill graph-aware run variables`

---

### Task 8: Expose immutable version APIs

**Files:**
- Create: `apps/workflow-web/features/workflows/versions/types.ts`
- Create: `apps/workflow-web/features/workflows/versions/repository.ts`
- Create: `apps/workflow-web/features/workflows/versions/repository.test.ts`
- Create: `apps/workflow-web/app/api/test-cases/[testCaseId]/versions/route.ts`
- Create: `apps/workflow-web/app/api/workflow-versions/[versionId]/route.ts`
- Create: `apps/workflow-web/app/api/workflow-versions/[versionId]/runs/route.ts`

**DTOs:**

```ts
export interface WorkflowVersionSummary {
  id: string
  testCaseId: string
  versionNumber: number
  createdAt: string
  stepCount: number
  latestRun?: { id: string; status: string; createdAt: string }
}

export interface WorkflowVersionDetail extends WorkflowVersionSummary {
  graph: WorkflowGraph
  workflow: Workflow
}
```

- [ ] **Step 1: Write repository/API tests**

Prove newest-first ordering, test-case isolation, stable step count, latest associated run, version detail 404, graph/workflow immutability and exact replay through the explicit version-run endpoint.

- [ ] **Step 2: Implement list/detail endpoints**

List uses `workflow_versions(test_case_id, version_number DESC)`. Detail never joins editable `test_cases.graph` as a substitute for the immutable stored graph.

- [ ] **Step 3: Implement version replay endpoint**

`POST /api/workflow-versions/:versionId/runs` validates that version's referenced fields, updates the current preset and queues the stored workflow unchanged.

- [ ] **Step 4: Verify**

Run `skwf test`. Create two versions with different graph labels and confirm each detail still returns its original graph.

**Proposed commit after authorization:** `feat(workflow): expose immutable workflow version APIs`

---

### Task 9: Add Versions UI and restore-to-draft behavior

**Files:**
- Create: `apps/workflow-web/features/workflows/versions/versions-panel.tsx`
- Create: `apps/workflow-web/features/workflows/versions/versions-panel.test.tsx`
- Create: `apps/workflow-web/features/workflows/versions/version-graph-viewer.tsx`
- Modify: `apps/workflow-web/features/workflows/components/workflow-editor-provider.tsx`
- Modify: `apps/workflow-web/features/workflows/components/workflow-editor.test.tsx`
- Modify: `apps/workflow-web/features/workflows/components/workflow-shell.tsx`

- [ ] **Step 1: Add failing editor tests**

Add `restoreVersionGraph(graph, versionNumber)` and prove invalid graphs leave the current draft untouched, valid restore clears node selection, sets `isDirty=true`, records `restoredFromVersion`, and does not call `onSave`.

- [ ] **Step 2: Add the Versions mode**

Header order is `Workflow | Authoring | Versions | Runs`. Each row exposes View, Run this version and Restore to draft. View uses a read-only React Flow viewer: no drag, connect, delete or inspector edits.

- [ ] **Step 3: Implement explicit restore UX**

Restore loads version detail, validates its graph, copies it to editor state, switches to Workflow and shows `Restored from vN — save to keep this draft`. Reload before Save returns the previous saved draft.

- [ ] **Step 4: Prove N+1 semantics**

Integration test: create v1 graph A, v2 graph B, restore v1, Save, reload and assert current draft A; Run and assert new v3 graph A while v1/v2 remain unchanged.

- [ ] **Step 5: Verify**

Run `skwf test` and perform the restore sequence manually in the local UI.

**Proposed commit after authorization:** `feat(workflow): add immutable version browser and restore`

---

### Task 10: Persist and reload run history

**Files:**
- Modify: `apps/workflow-web/features/workflows/runs/types.ts`
- Create: `apps/workflow-web/features/workflows/runs/run-history-repository.ts`
- Create: `apps/workflow-web/features/workflows/runs/run-history-repository.test.ts`
- Create: `apps/workflow-web/app/api/test-cases/[testCaseId]/runs/route.ts`
- Create: `apps/workflow-web/features/workflows/runs/runs-history-panel.tsx`
- Create: `apps/workflow-web/features/workflows/runs/runs-history-panel.test.tsx`
- Modify: `apps/workflow-web/features/workflows/runs/workflow-runs-provider.tsx`
- Modify: `apps/workflow-web/features/workflows/runs/workflow-runs-provider.test.tsx`
- Modify: `apps/workflow-web/features/workflows/components/console-panel.tsx`
- Modify: `apps/workflow-web/features/workflows/components/workflow-shell.tsx`

**Summary DTO:**

```ts
export interface TestRunSummary {
  id: string
  workflowVersionId: string
  versionNumber: number
  status: string
  createdAt: string
  startedAt?: string
  finishedAt?: string
  failedStep?: { stepId: string; title: string; error: string }
}
```

- [ ] **Step 1: Write repository and UI tests**

Prove latest 50 ordering, test-case isolation through the version relation, terminal/in-progress statuses, failed-step summary, reload after provider remount, selection of an old run, loading persisted detail and artifacts, and absence of plaintext variables.

- [ ] **Step 2: Implement history query and endpoint**

`GET /api/test-cases/:testCaseId/runs?limit=50` clamps the limit to 1–50 and joins `test_runs` to `workflow_versions`. Keep existing `GET /api/runs/:runId` as the normalized detail source.

- [ ] **Step 3: Replace the Runs placeholder**

The Runs tab lists persisted records. Selecting a row drives the existing console/log/artifact viewer. Run again uses that row's `workflowVersionId` and the current runtime preset.

- [ ] **Step 4: Refresh at stable times**

Load history on provider mount, after a run is accepted, and when polling observes a terminal status. Do not add a second background polling loop for already terminal runs.

- [ ] **Step 5: Verify**

Run `skwf test`. Start a run, wait for completion, reload the browser and confirm the same run, steps and artifacts reopen.

**Proposed commit after authorization:** `feat(workflow): add persisted run history UI`

---

### Task 11: Add end-to-end acceptance for all eight checkpoints

**Files:**
- Create: `apps/workflow-web/tests/acceptance/run-runtime-history-acceptance.mjs`
- Modify: `scripts/skwf`
- Modify: `scripts/skwf.test.sh`
- Modify: `infra/docker-compose.workflow.yml`
- Modify: `README.md`

- [ ] **Step 1: Create a sanitized local fixture**

The fixture must contain fields for `username`, `password`, `taskTitle` and `assigneeName`, deterministic success/failure UI, screenshots and no external network dependency. Do not use HCNS credentials, selectors or production URLs.

- [ ] **Step 2: Automate the accepted flow**

The acceptance script must prove:

1. first Run stores one preset and creates v1;
2. reopening/reloading prefills clear-text values in the internal UI;
3. second Run overwrites the same preset row and creates v2;
4. empty referenced task title/assignee blocks before version and run creation;
5. Versions lists v2 then v1 and each View graph is immutable;
6. Run this version executes v1 without creating v3;
7. Runs survives browser reload and exposes steps/artifacts;
8. restore v1 marks draft dirty, reload before Save discards it, restore+Save persists it, and the next normal Run creates v3 without changing v1/v2.

- [ ] **Step 3: Add one short launcher command**

Expose `skwf history-acceptance`, runnable from any folder after the existing one-time installer. It must use the existing images/services and must not silently rebuild an image.

- [ ] **Step 4: Verify data directly**

After acceptance, query PostgreSQL and assert exactly one preset row, three immutable versions, expected run count, no plaintext password in `test_case_runtime_values.password_ciphertext`, `test_runs.variables`, logs or errors.

- [ ] **Step 5: Document operator behavior**

README must explain key configuration, Run prefill, Versions View/Run/Restore, explicit Save semantics, Runs after reload, internal-only password display and the authentication prerequisite for public deployment.

**Proposed commit after authorization:** `test(workflow): cover runtime presets versions and history`

---

### Task 12: Regression and completion verification

**Required skill:** `superpowers:verification-before-completion`

- [ ] **Step 1: Inspect Git scope before tests**

Confirm only planned files changed. Report any scope expansion before editing unlisted production files.

- [ ] **Step 2: Run the complete non-destructive suite**

```bash
skwf test
skwf worker-acceptance
skwf acceptance
skwf authoring-test
skwf authoring-acceptance
skwf history-acceptance
```

Expected: all commands pass using existing local containers/images. If a command requires an image rebuild not already approved, stop and report instead of rebuilding.

- [ ] **Step 3: Verify security and persistence invariants**

Check PostgreSQL directly for one preset per test case, ciphertext-only password storage, redacted run variables, immutable v1/v2/v3 graphs, and history ordered newest first. Search web/worker logs and generated artifacts for the submitted plaintext test password.

- [ ] **Step 4: Verify browser behavior manually**

From the local UI, perform: reopen saved test case → prefilled Run → Versions View → Run old version → Runs reload → Restore → Save → reload. Record the web port and artifact locations in the final report.

- [ ] **Step 5: Check final container state**

Run `docker compose ... ps -a`. Report actual status and stop only containers started by this implementation workflow. Do not remove the PostgreSQL volume.

- [ ] **Step 6: Report completion without unauthorized Git actions**

Report changed files, migration applied, image ID/size if rebuilt with permission, tests and acceptance evidence, known public-deployment security blocker, and proposed commit split. Do not commit, push or create a PR without a new explicit request.

## Recommended Commit / Pull Request Split

Execute only after explicit authorization:

1. `feat/workflow-runtime-presets`
   - Commit 1: `feat(workflow): add graph-aware runtime field registry`
   - Commit 2: `feat(workflow): encrypt and persist runtime presets`
   - Commit 3: `feat(workflow): atomically prepare workflow runs`
2. `feat/workflow-version-history`
   - Commit 1: `feat(workflow): expose immutable workflow versions`
   - Commit 2: `feat(workflow): add version view run and restore UI`
   - Commit 3: `feat(workflow): add persisted run history UI`
3. `test/workflow-runtime-history-acceptance`
   - Commit 1: `test(workflow): cover presets versions history and restore`
   - Commit 2: `docs(workflow): document version and runtime-value lifecycle`

The second branch depends on the first. The acceptance branch depends on both. While dependencies are open, target each dependent PR at its dependency branch so its diff contains only new scope; retarget to the remote default branch after dependencies merge. Never merge automatically.

## Definition of Done

- One current runtime preset exists per test case and repeated Runs overwrite it.
- Password is AES-256-GCM ciphertext at rest and decrypts only through the server key.
- Run and Run again render only referenced fields and prefill after page reload.
- New Run persistence is atomic before worker dispatch; replay creates no new version.
- Versions are immutable, newest first, viewable, runnable and restorable to a dirty draft.
- Restore requires explicit Save; the next normal Run creates vN+1.
- Runs reload from PostgreSQL with steps, failures and artifacts.
- All eight acceptance checkpoints pass against the sanitized local fixture.
- No public deployment is represented as safe before authentication and authorization are implemented.
- No unauthorized image build, volume deletion, dependency installation, commit, push, PR or merge occurred.
