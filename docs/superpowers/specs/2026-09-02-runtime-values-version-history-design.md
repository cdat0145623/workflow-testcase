# Runtime Values, Workflow Versions and Run History Design

## Summary

This change makes one test case reusable across page reloads. It stores exactly one current set of runtime values per test case, exposes immutable workflow versions and persisted runs in the UI, and allows an old version to be copied back into the editable draft without mutating history.

The current `Project → Feature → TestCase` hierarchy remains unchanged. Each test case continues to own one editable workflow graph. A workflow version is an immutable snapshot created by Run or Approve; it is not a second editable workflow.

## Goals

1. Persist one current runtime-value record per test case and overwrite it on every successful Run submission.
2. Encrypt the stored password with AES-256-GCM and decrypt it server-side when reopening the internal Run dialog.
3. Prefill the Run and Run again dialogs from the current runtime-value record.
4. Validate only variables referenced by the graph/version, including non-empty `taskTitle` and `assigneeName` when used.
5. List immutable workflow versions for the selected test case.
6. View, run and restore an immutable version from the UI.
7. Reload persisted run history from PostgreSQL and reopen its steps and artifacts.
8. Restore a version into the editable draft, require an explicit Save, and create a new immutable version on the next Run.

## Non-goals

- Multiple editable workflows under one test case.
- Runtime-value history or rollback.
- Deleting workflow versions or runs.
- A credentials vault, key rotation UI or multi-tenant secret management.
- UI-to-agent dispatch, agent heartbeat, task queue, VPS orchestration or Telegram control.
- Running automated acceptance against HCNS production.

## Current Behavior

- `test_cases.graph` stores one editable graph.
- Run creates a new immutable `workflow_versions` row and queues the worker.
- The Run dialog always renders four fixed fields and clears them when closed.
- All submitted variables are stored as `[REDACTED]` in `test_runs`.
- The web UI keeps only the latest in-memory run after submission; it does not reload run history.
- Workflow versions exist in PostgreSQL but have no list, detail or restore UI.

## Data Model

### `test_case_runtime_values`

```sql
CREATE TABLE test_case_runtime_values (
  test_case_id UUID PRIMARY KEY REFERENCES test_cases(id) ON DELETE CASCADE,
  username TEXT NOT NULL DEFAULT '',
  password_ciphertext TEXT NOT NULL DEFAULT '',
  task_title TEXT NOT NULL DEFAULT '',
  assignee_name TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

There is exactly one row per test case. A new Run submission performs an upsert; it never appends runtime-value history. Non-secret values remain plaintext for this internal test version. Password ciphertext is an encoded AES-GCM envelope containing a format version, random IV, authentication tag and ciphertext.

The server reads a 32-byte base64 key from `WORKFLOW_RUNTIME_SECRET_KEY`. The key is never persisted in PostgreSQL or sent to the worker. A missing, malformed or incorrect key returns a stable configuration/decryption error and does not queue a run.

### Existing workflow versions and runs

`workflow_versions` remains immutable. Add query indexes only where the existing schema does not already support:

```text
workflow_versions(test_case_id, version_number DESC)
test_runs(workflow_version_id, created_at DESC)
```

`test_runs.variables` continues to contain only `[REDACTED]` values. Runtime-value prefill always reads `test_case_runtime_values`; it never recovers values from run history.

## Runtime Variable Rules

The server extracts placeholders from the graph/version before validation. Known fields map as follows:

| Placeholder | UI label | Persistence | Validation |
| --- | --- | --- | --- |
| `username` | Username | plaintext | non-empty when referenced |
| `password` or `secret.login_password` | Password | AES-GCM ciphertext | non-empty when referenced |
| `taskTitle` | Task title | plaintext | trimmed, non-empty when referenced |
| `assigneeName` | Assignee name | plaintext | trimmed, non-empty when referenced |

The dialog renders only fields referenced by the current graph/version. Unknown placeholders render as generic text inputs but are not persisted by this MVP; they must be entered for each run. `baseUrl` is supplied by the test case and never rendered as a runtime field.

## Run Transaction Boundary

Starting a new run follows this order:

```text
validate graph and referenced variables
→ encrypt password
→ upsert test_case_runtime_values
→ create immutable WorkflowVersion
→ save editable graph
→ queue worker
```

If validation, encryption or runtime-value persistence fails, no version is created and no worker request is sent. Once a version is created, a worker failure does not roll back the version or runtime-value preset; those records are required for diagnosis and Run again.

Running an existing version does not create another version:

```text
load immutable version
→ validate referenced variables
→ upsert current runtime values
→ queue exact stored workflow
```

## API Boundaries

### Runtime values

```text
GET  /api/test-cases/:testCaseId/runtime-values
PUT  /api/test-cases/:testCaseId/runtime-values
```

`GET` decrypts the password server-side and returns the current internal-test values. `PUT` validates and upserts one record. The normal Run endpoint performs the same upsert atomically before creating/queueing work, so clients do not have to call `PUT` separately.

### Versions

```text
GET  /api/test-cases/:testCaseId/versions
GET  /api/workflow-versions/:versionId
POST /api/workflow-versions/:versionId/runs
```

The list is newest first. Version detail returns the immutable graph and compiled workflow. Running a version queues its stored workflow unchanged.

Restore is intentionally client-side: version detail supplies the graph, and the editor copies it into draft state with `isDirty=true`. No restore endpoint mutates the database before the user presses Save.

### Runs

```text
GET /api/test-cases/:testCaseId/runs?limit=50
GET /api/runs/:runId
```

The list returns the 50 newest runs with version number, status, timestamps and failed-step summary. Run detail continues to expose normalized steps and artifact links without plaintext runtime values.

## UI Behavior

The test-case header modes become:

```text
Workflow | Authoring | Versions | Runs
```

### Run dialog

- Opening the dialog fetches current runtime values and prefills referenced fields.
- Password is displayed in clear text for this explicitly internal test version.
- Required-field errors are shown inline and focus the first invalid field.
- Submit remains disabled while values are loading or a Run request is pending.
- A successful submission closes the dialog; reopening loads the newly persisted values.
- Run again loads the same current preset but executes the selected run's immutable version.

### Versions

Each row shows version number, creation time, step count and latest associated run status. Actions:

- **View:** open the immutable graph read-only.
- **Run this version:** open the prefilled Run dialog and replay the exact stored workflow.
- **Restore to draft:** copy the version graph into the editor, switch to Workflow, mark the editor dirty and show `Restored from vN — save to keep this draft`.

Restore never reorders or rewrites versions. Example:

```text
v1 = graph A
v2 = graph B
restore v1 → editable draft becomes graph A
Save → reload displays graph A as the current draft
Run → creates v3 from graph A
```

### Runs

The Runs tab reloads from PostgreSQL on page load and when a run reaches a terminal status. Selecting a row opens persisted steps, error details, screenshots, trace and reports. Run again uses the row's `workflowVersionId` and current runtime preset.

## Error Handling

- Missing or invalid encryption key: show a server-configuration error; do not overwrite the stored ciphertext.
- Decryption authentication failure: show that saved credentials cannot be decrypted; do not return partial secret data.
- Missing referenced variable: return field-level validation errors; do not create a version or run.
- Runtime-value upsert failure: do not create a version or queue the worker.
- Unknown/deleted version: preserve the current editor and display a not-found message.
- Invalid restored graph: preserve the current editor and report graph diagnostics.
- Worker failure: retain the version, runtime preset, run, steps and artifacts for retry/debugging.

## Security Boundary

Displaying decrypted passwords is allowed only for this internal test version and requires a same-origin server response. Ciphertext, IV and authentication tag are never sent to the worker or exposed directly to browser code. Logs, run records, error messages and artifacts must not contain the password.

Before any public Vercel deployment, the runtime-values endpoints and test-case pages must be protected by authentication and authorization. An unlisted Vercel URL is still publicly reachable.

## Migration and Docker Impact

Add `apps/workflow-worker/sql/006_runtime_values_and_history.sql`. The migration is idempotent and preserves the existing PostgreSQL volume. Because migrations are baked into `sendkit-workflow-worker:slim-v1`, implementation must stop at the Docker-impact checkpoint and obtain explicit build permission before rebuilding only the worker image and applying migration 006.

Web changes continue to use the existing hot-reload container and do not trigger a web image build.

## Verification

### Unit and integration

- AES-GCM round trip, random ciphertext and wrong-key failure.
- Runtime-value upsert retains exactly one row and never stores plaintext password.
- Graph-aware required-variable validation.
- New Run aborts before version/worker when preset persistence fails.
- Version list ordering and exact immutable replay.
- Run list survives process/page reload and remains scoped to the test case.
- Restore changes only client draft state until Save.
- Save after restore survives reload; next Run creates `vN+1` without altering prior versions.

### UI acceptance

Use a sanitized local fixture:

```text
open test case
→ Run dialog is prefilled
→ edit task title and Run
→ reload
→ Versions contains the new version
→ Runs contains the new run
→ view an old immutable graph
→ restore it to dirty draft
→ Save and reload
→ current graph equals the restored graph
```

Automated acceptance must not access or mutate HCNS production.

## Acceptance Criteria

- One and only one runtime-value row exists per test case after repeated Runs.
- Password ciphertext does not contain the plaintext password and can be decrypted with the configured key.
- Run and Run again dialogs prefill current values after reload.
- Required referenced variables block execution when empty.
- Versions remain immutable, ordered and independently runnable.
- Runs reload from PostgreSQL with steps and artifacts after page refresh.
- Restore copies an old version into a dirty draft; Save controls persistence.
- A Run after restore creates a new version and leaves all earlier versions unchanged.
