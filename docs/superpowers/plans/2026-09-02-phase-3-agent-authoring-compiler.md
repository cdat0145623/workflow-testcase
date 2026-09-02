# Phase 3 Agent Authoring and Workflow Compiler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép agent local nhận một requirement ngắn, thu thập bằng chứng từ source và UI, tạo test plan có giải thích, compile thành workflow graph để người dùng review, rồi phát hành một `WorkflowVersion` bất biến có thể replay mà không gọi lại agent/LLM.

**Architecture:** Phase 3 không nhúng một nhà cung cấp LLM vào SendKit. Codex CLI, Claude CLI hoặc agent local khác đóng vai trò authoring agent và giao tiếp với SendKit qua local MCP; web app lưu authoring session, evidence, action trace, decision log và review state. Một compiler deterministic chuẩn hóa trace thành `WorkflowGraph`; graph hiện có tiếp tục được `compileGraph()` chuyển sang contract của worker Phase 1, nên replay vẫn hoàn toàn deterministic.

**Tech Stack:** Bun 1.2.22, TypeScript 6, Zod 4, MCP SDK 1.29, Next.js 16, React 19, PostgreSQL 16, Drizzle ORM, React Flow 12, Docker Compose và worker Playwright Phase 1 hiện có.

**Spec:** `docs/superpowers/plans/2026-09-01-phase-0-scope.md` (mục 0.1–0.5 và 0.8–0.9), kết hợp boundary đã khóa trong `docs/superpowers/specs/2026-09-02-phase-2-workflow-ui-integration-design.md`.

## Global Constraints

- SendKit là source of truth duy nhất; `browser-automation-app` và source project được test chỉ là nguồn tham chiếu read-only.
- Không tạo Git worktree mới.
- Không tạo hoặc thay đổi host `node_modules`; mọi install/test/build dependency chạy trong container hiện có.
- Không commit, push, tạo Pull Request, merge hoặc force-push nếu người dùng chưa yêu cầu.
- Không triển khai VPS, remote MCP, Telegram orchestration, Supabase, Vercel-to-local dispatch, n8n, Trigger.dev, Browserbase hoặc Stagehand trong Phase 3.
- Không hard-code OpenAI, Anthropic hoặc một LLM provider; agent local sử dụng local MCP là adapter đầu tiên.
- Source discovery luôn đi trước browser discovery. Nếu source không khả dụng, session phải lưu `source_unavailable` cùng lý do và buộc người dùng thấy cảnh báo khi review.
- Source workspace chỉ được đọc trong allowlist local; web app không lưu absolute host path và mọi path traversal phải bị từ chối.
- Không lưu username/password/token plaintext trong authoring event, graph, log, screenshot metadata hoặc workflow version. Secret chỉ xuất hiện dưới placeholder `{{secret.<name>}}`.
- Compiler không tự suy đoán business rule thiếu bằng chứng; mọi suy luận phải có provenance `source`, `browser` hoặc `agent` và mức confidence.
- Workflow được approve phải tuyến tính, dùng node catalog Phase 2 và tạo `WorkflowVersion` bất biến.
- Replay không gọi MCP authoring tool, agent, LLM, source discovery hoặc browser discovery; replay chỉ dùng worker Phase 1.
- Không self-heal locator trong replay. Locator mơ hồ hoặc chưa verify là blocker trước approval.
- Mọi workflow có thao tác ghi dữ liệu (`fill`, `select`, click submit/save/create) phải qua review thủ công trước approval.
- Web source tiếp tục hot reload; thay đổi web/local MCP/contract không được tự động làm phát sinh worker-image rebuild.
- Migration 005 là thay đổi duy nhất dự kiến ảnh hưởng worker image trong Phase 3. Việc build image phải dừng tại checkpoint và chờ quyền rõ ràng theo `AGENTS.md`.

---

## Outcome and Non-goals

### Phase 3 bàn giao

```text
Requirement ngắn
  → AuthoringSession
  → agent đọc source qua local MCP
  → source evidence + business rules
  → test plan và scope
  → agent khám phá UI bằng browser tool có sẵn
  → recorded actions + locator candidates + screenshots
  → deterministic authoring compiler
  → draft WorkflowGraph + diagnostics + decision log
  → user review/approve
  → immutable WorkflowVersion
  → Run/Run again bằng worker hiện tại, không gọi agent
```

### Phase 3 không bàn giao

- SendKit tự gọi API LLM để tự lập kế hoạch.
- Browser agent chạy như daemon trên VPS.
- Cloud UI tự đẩy task về laptop.
- Agent tự approve workflow có write action.
- Graph branching, parallel execution hoặc conditional node.
- Tự sửa selector khi replay fail.
- Scheduler chạy workflow định kỳ.

## File Map

### Shared authoring contracts

- `packages/workflow-contract/src/authoring.ts`: Zod schemas và DTO cho authoring session, source evidence, test plan, recorded action, decision, diagnostic và compiler result.
- `packages/workflow-contract/src/index.ts`: export public authoring contract.
- `packages/workflow-contract/tests/authoring.test.ts`: validation, secret placeholder và provenance tests.

### Persistence and authoring server

- `apps/workflow-worker/sql/005_phase_3_authoring.sql`: thêm `projects.source_workspace_key`, `authoring_sessions` và append-only `authoring_events`.
- `apps/workflow-web/lib/db/schema.ts`: Drizzle schema tương ứng.
- `apps/workflow-web/features/authoring/repository.ts`: transaction-safe session/event repository.
- `apps/workflow-web/features/authoring/repository.test.ts`: session state, event ordering và project isolation.
- `apps/workflow-web/features/authoring/service.ts`: state machine, permission gates, redaction và orchestration server-side.
- `apps/workflow-web/features/authoring/service.test.ts`: source-first, review, write-action và secret tests.
- `apps/workflow-web/app/api/authoring/sessions/route.ts`: tạo session và list session theo test case.
- `apps/workflow-web/app/api/authoring/sessions/[sessionId]/route.ts`: đọc session snapshot.
- `apps/workflow-web/app/api/authoring/sessions/[sessionId]/events/route.ts`: append structured evidence/action/decision event.
- `apps/workflow-web/app/api/authoring/sessions/[sessionId]/compile/route.ts`: compile draft.
- `apps/workflow-web/app/api/authoring/sessions/[sessionId]/approve/route.ts`: approve và tạo immutable version.
- `apps/workflow-web/app/api/authoring/sessions/[sessionId]/artifacts/route.ts`: upload screenshot PNG/JPEG giới hạn dung lượng.
- `apps/workflow-web/app/api/authoring/artifacts/[sessionId]/[...path]/route.ts`: serve artifact read-only với path confinement.

### Source discovery and local MCP

- `packages/local-mcp/src/workflow-client.ts`: HTTP client tới same-origin authoring API.
- `packages/local-mcp/src/source-workspaces.ts`: parse allowlist, resolve workspace key và ngăn path traversal.
- `packages/local-mcp/src/source-search.ts`: search source bằng `rg`, trả file/line/symbol/snippet đã redact.
- `packages/local-mcp/src/authoring-tools.ts`: đăng ký MCP tools cho lifecycle, source evidence, action recording, artifact và compile/review.
- `packages/local-mcp/src/index.ts`: giữ tool Telegram hiện có và đăng ký authoring tools.
- `packages/local-mcp/tests/source-workspaces.test.ts`: allowlist/path traversal tests.
- `packages/local-mcp/tests/authoring-tools.test.ts`: tool schema và HTTP adapter tests.
- `packages/local-mcp/package.json`: test script và dependency tới workflow contract.
- `apps/workflow-web/.env.example`: mô tả server URL; không chứa host source path hoặc secret.

### Deterministic authoring compiler

- `apps/workflow-web/features/authoring/compiler/types.ts`: normalized compiler input/output nội bộ.
- `apps/workflow-web/features/authoring/compiler/locator-ranking.ts`: thứ tự `test_id → role/name → label → name/id → css → xpath`.
- `apps/workflow-web/features/authoring/compiler/compile-authoring-draft.ts`: action trace → linear `WorkflowGraph`.
- `apps/workflow-web/features/authoring/compiler/diagnostics.ts`: blockers/warnings cho evidence, waits, assertions, coverage và secrets.
- `apps/workflow-web/features/authoring/compiler/compile-authoring-draft.test.ts`: golden compiler tests, gồm HCNS filter behavior.
- `apps/workflow-web/features/authoring/compiler/locator-ranking.test.ts`: stable locator selection tests.

### Review UI

- `apps/workflow-web/features/authoring/components/authoring-panel.tsx`: entry point Start authoring/Resume review.
- `apps/workflow-web/features/authoring/components/requirement-form.tsx`: requirement và source workspace key.
- `apps/workflow-web/features/authoring/components/source-evidence-list.tsx`: file/line/finding/provenance.
- `apps/workflow-web/features/authoring/components/test-plan-view.tsx`: scope, cases, risk và expected outcomes.
- `apps/workflow-web/features/authoring/components/action-timeline.tsx`: browser steps, locators, before/after state và screenshots.
- `apps/workflow-web/features/authoring/components/decision-log.tsx`: quyết định, căn cứ và confidence.
- `apps/workflow-web/features/authoring/components/review-gate.tsx`: blocker/warning, Approve/Reject/Revise.
- `apps/workflow-web/features/authoring/components/authoring-panel.test.tsx`: review UI behavior.
- `apps/workflow-web/features/workflows/components/workflow-shell.tsx`: thêm Authoring tab và draft graph preview.
- `apps/workflow-web/features/workflows/components/workflow-editor-provider.tsx`: nhận draft graph sau compile nhưng chỉ ghi graph chính khi approve.
- `apps/workflow-web/app/projects/[projectId]/features/[featureId]/test-cases/[testCaseId]/page.tsx`: load authoring summary cùng test case.

### Acceptance and operations

- `apps/workflow-web/tests/fixtures/hcns-authoring.ts`: sanitized source evidence, browser trace và expected graph của behavior filter nhân viên.
- `apps/workflow-web/tests/acceptance/run-authoring-acceptance.mjs`: create → evidence → compile → review → approve → replay twice.
- `scripts/skwf`: thêm `authoring-test` và `authoring-acceptance`, vẫn chạy được từ mọi folder.
- `infra/docker-compose.workflow.yml`: tái sử dụng mount `.local-data/artifacts` cho authoring artifacts; không tạo service hoặc image mới.
- `README.md`: cách cấu hình local MCP, source workspace allowlist và Phase 3 authoring flow.

---

### Task 1: Define the shared authoring contract and secret boundary

**Files:**
- Create: `packages/workflow-contract/src/authoring.ts`
- Create: `packages/workflow-contract/tests/authoring.test.ts`
- Modify: `packages/workflow-contract/src/index.ts`

**Interfaces:**
- Produces: `AuthoringSessionStatus`, `AuthoringSourceStatus`, `AuthoringRiskLevel`, `SourceEvidence`, `SourceBusinessRule`, `AuthoringTestPlan`, `RecordedAction`, `AuthoringDecision`, `AuthoringDiagnostic`, `AuthoringEventInput` and `AuthoringCompileResult`.
- Produces: Zod schemas with the same lower-camel-case names plus `Schema` suffix.
- Consumes: existing `locatorSchema` and workflow graph-compatible action vocabulary.

- [ ] **Step 1: Write failing contract tests**

Add tests proving:

1. a source evidence item requires workspace key, relative file path, line range, finding and provenance `source`;
2. `fill` against a sensitive field accepts `{{secret.login_password}}` and rejects `plain-text-password` or any literal value;
3. a recorded action can retain multiple locator candidates but never a cookie/header/token value;
4. an agent decision requires `decision`, `because`, `evidenceIds` and confidence between `0` and `1`;
5. an authoring event rejects unknown keys.

Use this public shape:

```ts
export type AuthoringSessionStatus =
  | "drafting"
  | "source_review"
  | "browser_discovery"
  | "needs_review"
  | "approved"
  | "rejected"
  | "failed"
  | "cancelled"

export type AuthoringSourceStatus = "pending" | "complete" | "unavailable"
export type AuthoringRiskLevel = "read_only" | "write" | "destructive"

export interface SourceEvidence {
  id: string
  workspaceKey: string
  relativePath: string
  startLine: number
  endLine: number
  symbol?: string
  finding: string
  excerpt?: string
  provenance: "source"
}

export interface SourceBusinessRule {
  id: string
  statement: string
  evidenceIds: string[]
  requiredCoverageTags: string[]
}

export interface RecordedAction {
  id: string
  kind: "navigate" | "click" | "fill" | "select" | "wait" | "assert_visible" | "assert_text" | "screenshot"
  label: string
  locatorCandidates?: Array<{ locator: Locator; verified: boolean; matchCount: number }>
  value?: string
  targetUrl?: string
  waitFor?: { locator: Locator; state: "attached" | "visible" }
  coverageTags: string[]
  artifactIds: string[]
  provenance: "browser" | "agent"
}
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run from any directory:

```bash
skwf test
```

Expected: contract build/test fails because `authoring.ts` and its exports do not exist.

- [ ] **Step 3: Implement strict Zod schemas**

Use `.strict()` for object schemas, cap `finding` at 2,000 characters and `excerpt` at 1,000 characters, require relative paths without `..`, and enforce this rule:

```ts
const secretPlaceholder = /^\{\{secret\.[a-z][a-z0-9_]*\}\}$/
```

If `sensitive === true`, the action value must match `secretPlaceholder`. If a non-sensitive value resembles a bearer token, cookie, API key or password assignment, reject it with `Secret-like literal values are not allowed`.

- [ ] **Step 4: Run contract and existing workflow tests**

Run `skwf test`. Expected: new contract tests and all Phase 2 web/contract tests pass; no worker image build.

- [ ] **Step 5: Review checkpoint**

Verify names exported from `index.ts` exactly match the Interfaces block and report that no plaintext test credential exists in the diff.

---

### Task 2: Persist authoring sessions and append-only audit events

**Files:**
- Create: `apps/workflow-worker/sql/005_phase_3_authoring.sql`
- Modify: `apps/workflow-web/lib/db/schema.ts`
- Create: `apps/workflow-web/features/authoring/repository.ts`
- Create: `apps/workflow-web/features/authoring/repository.test.ts`
- Modify: `apps/workflow-web/features/catalog/types.ts`
- Modify: `apps/workflow-web/features/catalog/repository.ts`

**Interfaces:**
- Produces: `AuthoringRepository.createSession()`, `getSession()`, `listSessions(testCaseId)`, `appendEvent()`, `listEvents()`, `transition()` and `saveCompiledDraft()`.
- Produces: `CatalogRepository.setSourceWorkspaceKey(projectId, key)`; only the key is persisted, never a host path.
- Consumes: Task 1 DTOs.

- [ ] **Step 1: Write repository integration tests**

Test these invariants against project PostgreSQL:

- session belongs to exactly one test case;
- sessions from project A cannot be returned under test case B;
- event `sequence` increments under a transaction-level advisory lock;
- `(session_id, sequence)` is unique;
- events cannot be updated or deleted through repository methods;
- status transition `approved → drafting` is rejected;
- source workspace stores `hcns`, not an absolute host path.

- [ ] **Step 2: Confirm RED before migration**

Run `skwf test`. Expected: repository test fails because migration/table/repository are absent.

- [ ] **Step 3: Add idempotent migration 005**

Create:

```sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS source_workspace_key TEXT;

CREATE TABLE IF NOT EXISTS authoring_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_case_id UUID NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  requirement TEXT NOT NULL,
  status TEXT NOT NULL,
  risk_level TEXT NOT NULL DEFAULT 'write',
  source_status TEXT NOT NULL DEFAULT 'pending',
  draft_graph JSONB,
  diagnostics JSONB NOT NULL DEFAULT '[]'::jsonb,
  approved_workflow_version_id TEXT REFERENCES workflow_versions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS authoring_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES authoring_sessions(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, sequence)
);
```

Add `CHECK` constraints for the exact status/risk/source-status values from Task 1. Do not add an UPDATE/DELETE API for events.

- [ ] **Step 4: Implement repository transactions**

`appendEvent(sessionId, event)` must `BEGIN`, acquire `pg_advisory_xact_lock(hashtext(sessionId))`, calculate `MAX(sequence)+1`, insert and `COMMIT`. On any error it must `ROLLBACK` and release the client.

- [ ] **Step 5: Stop at the Docker-impact checkpoint**

Report:

- changed migration/schema files;
- current `sendkit-workflow` container state from `docker compose ... ps`;
- build scope `migrate` only;
- service/image affected: `workflow-worker` because SQL migrations are baked into that image;
- migration 005 will run; web image will not build;
- existing PostgreSQL volume is preserved.

Do not build until the user explicitly approves the foreground build/run command required by `AGENTS.md`.

- [ ] **Step 6: Apply migration after approval and run tests**

After the approved foreground workflow applies migration 005, run `skwf test`. Expected: repository tests pass and existing projects, test cases, workflow versions and runs remain present.

- [ ] **Step 7: Verify migration integrity**

Query for invalid statuses, duplicate sequences, orphan sessions/events and absolute paths in `source_workspace_key`. Expected: zero rows for all checks.

---

### Task 3: Implement source-workspace confinement and source search in local MCP

**Files:**
- Create: `packages/local-mcp/src/source-workspaces.ts`
- Create: `packages/local-mcp/src/source-search.ts`
- Create: `packages/local-mcp/tests/source-workspaces.test.ts`
- Modify: `packages/local-mcp/package.json`
- Modify: `apps/workflow-web/.env.example`

**Interfaces:**
- Produces: `parseSourceWorkspaces(raw: string): Map<string, string>`.
- Produces: `resolveSourcePath(workspaces, workspaceKey, relativePath): string`.
- Produces: `searchSource(input: { workspaceKey: string; query: string; globs?: string[]; limit?: number }): Promise<SourceSearchMatch[]>`.
- `SourceSearchMatch` contains only `workspaceKey`, `relativePath`, `line`, `symbol?`, `excerpt`; never absolute path.

- [ ] **Step 1: Write confinement tests**

Use a temporary fixture tree and assert:

- `hcns:src/calendar.tsx` resolves within its configured root;
- `../`, absolute paths and symlinks escaping the root are rejected;
- unknown workspace keys are rejected;
- result paths are relative POSIX paths;
- `.env`, key files, `.git`, `node_modules`, build output and files larger than 1 MiB are excluded;
- source snippets redact password/token/cookie-like assignments.

- [ ] **Step 2: Confirm RED**

Run the local-MCP test inside the existing Docker dependency environment. Expected: FAIL because source workspace modules do not exist.

- [ ] **Step 3: Implement allowlist parsing**

Read one environment variable only:

```text
SENDKIT_SOURCE_WORKSPACES={"sendkit":"/workspace/sendkit","hcns":"/workspace/hcns"}
```

Canonicalize each root with `realpath()`. Resolve every candidate with `realpath()` and require it to equal the root or start with `${root}${path.sep}`. Return only relative paths to callers.

- [ ] **Step 4: Implement bounded `rg` search**

Invoke `rg --json --line-number --hidden` with fixed exclusion globs. Pass the query as one argv item without shell interpolation. Cap query length at 200, limit at 50 matches and excerpt length at 500 characters. Return an actionable error if `rg` is unavailable.

- [ ] **Step 5: Run tests and a read-only SendKit smoke search**

Search for `compileGraph` in workspace key `sendkit`; verify matches cite relative file and line, and output contains no absolute path. No Docker image build is required.

---

### Task 4: Build the authoring service, state machine and same-origin API

**Files:**
- Create: `apps/workflow-web/features/authoring/service.ts`
- Create: `apps/workflow-web/features/authoring/service.test.ts`
- Create: `apps/workflow-web/features/authoring/server.ts`
- Create: `apps/workflow-web/app/api/authoring/sessions/route.ts`
- Create: `apps/workflow-web/app/api/authoring/sessions/[sessionId]/route.ts`
- Create: `apps/workflow-web/app/api/authoring/sessions/[sessionId]/events/route.ts`

**Interfaces:**
- Produces: `createAuthoringService(ports)` with `start`, `getSnapshot`, `appendEvent`, `beginBrowserDiscovery`, `requestReview`, `reject` and `cancel`.
- Produces: HTTP JSON endpoints consumed by Task 5's local MCP client.
- Consumes: Task 1 schemas and Task 2 repository.

- [ ] **Step 1: Write state-machine tests**

Cover the exact legal transitions:

```text
drafting → source_review | cancelled
source_review → browser_discovery | failed | cancelled
browser_discovery → needs_review | failed | cancelled
needs_review → browser_discovery | rejected | approved
```

Also assert:

- `beginBrowserDiscovery` fails until at least one source evidence and one source-analysis-complete event exist;
- source-unavailable requires a non-empty reason and leaves a visible warning;
- an event payload is parsed again server-side, even if MCP already parsed it;
- requirement and event output are redacted before persistence;
- event append after `approved`, `rejected` or `cancelled` fails with HTTP 409.

- [ ] **Step 2: Confirm RED**

Run `skwf test`. Expected: imports/routes absent.

- [ ] **Step 3: Implement a pure state transition table**

Use a constant map rather than nested conditionals:

```ts
const allowedTransitions = {
  drafting: ["source_review", "cancelled"],
  source_review: ["browser_discovery", "failed", "cancelled"],
  browser_discovery: ["needs_review", "failed", "cancelled"],
  needs_review: ["browser_discovery", "rejected", "approved"],
  approved: [], rejected: [], failed: [], cancelled: [],
} as const
```

Persist every accepted transition as an event so the audit timeline can reconstruct what happened.

- [ ] **Step 4: Implement API routes with stable errors**

Return `{ data }` on success and `{ error: { code, message } }` on failure. Use 400 for invalid schema, 404 for unknown session, 409 for illegal state and 500 only for unexpected errors. Never return stack traces or environment values.

- [ ] **Step 5: Run service, route and regression tests**

Run `skwf test`. Expected: service/API tests and all existing Phase 2 tests pass.

---

### Task 5: Expose authoring operations as local MCP tools

**Files:**
- Create: `packages/local-mcp/src/workflow-client.ts`
- Create: `packages/local-mcp/src/authoring-tools.ts`
- Create: `packages/local-mcp/tests/authoring-tools.test.ts`
- Modify: `packages/local-mcp/src/index.ts`
- Modify: `packages/local-mcp/package.json`
- Modify: `bun.lock`

**Interfaces:**
- Produces MCP tools: `authoring_start`, `authoring_search_source`, `authoring_add_source_evidence`, `authoring_add_business_rule`, `authoring_set_test_plan`, `authoring_begin_browser_discovery`, `authoring_record_action`, `authoring_attach_artifact`, `authoring_request_review`, `authoring_compile`, `authoring_status`.
- Uses `SENDKIT_WORKFLOW_WEB_URL`, defaulting to `http://127.0.0.1:3000`.
- Consumes Task 3 source APIs and Task 4 HTTP APIs.

- [ ] **Step 1: Write MCP registration and HTTP tests**

Use a fake fetch server and assert each tool:

- exposes a strict schema and a description saying when it is valid;
- sends `testCaseId` and `sessionId` explicitly rather than deriving from a name;
- forwards only relative source paths;
- rejects literal sensitive values before HTTP;
- returns structured content suitable for the agent's next decision;
- leaves existing `telegram` tool behavior unchanged.

- [ ] **Step 2: Confirm RED**

Run the package test in Docker. Expected: authoring tool module is absent.

- [ ] **Step 3: Implement a model-neutral HTTP client**

Create `WorkflowAuthoringClient` with methods named after the service operations. Set a 15-second request timeout, parse the stable error envelope and never retry non-idempotent event appends automatically.

- [ ] **Step 4: Register tools without embedding an LLM**

`authoring_search_source` reads local files and returns matches. All remaining tools call the web API. No tool is allowed to approve a workflow; approval remains a web UI operation in Task 8.

- [ ] **Step 5: Update lockfile without host dependencies**

Update only `bun.lock` inside the Docker dependency environment. Verify no host `node_modules` directory is created.

- [ ] **Step 6: Build and smoke-test local MCP**

Build `@cwa-dev/sendkit-mcp` in the existing Docker environment, inspect the tool list and perform a create/status cycle against local web. This is a package build, not a Docker image build.

---

### Task 6: Compile recorded authoring evidence into a deterministic draft graph

**Files:**
- Create: `apps/workflow-web/features/authoring/compiler/types.ts`
- Create: `apps/workflow-web/features/authoring/compiler/locator-ranking.ts`
- Create: `apps/workflow-web/features/authoring/compiler/locator-ranking.test.ts`
- Create: `apps/workflow-web/features/authoring/compiler/diagnostics.ts`
- Create: `apps/workflow-web/features/authoring/compiler/compile-authoring-draft.ts`
- Create: `apps/workflow-web/features/authoring/compiler/compile-authoring-draft.test.ts`
- Modify: `apps/workflow-web/features/authoring/service.ts`
- Create: `apps/workflow-web/app/api/authoring/sessions/[sessionId]/compile/route.ts`

**Interfaces:**
- Produces: `rankLocatorCandidates(candidates): LocatorCandidate[]`.
- Produces: `compileAuthoringDraft(input: AuthoringCompilerInput): AuthoringCompileResult`.
- Consumes: source rules, test plan, recorded actions and Task 1 DTOs.
- Output graph must pass existing `validateGraph()`; executable output must pass existing `compileGraph()` with a temporary version ID.

- [ ] **Step 1: Write locator-ranking tests**

Assert verified locators sort before unverified locators, then by:

```text
test_id → role with accessible name → label → name → css → xpath
```

Reject candidates that match more than one element according to recorded verification metadata. If no unique verified locator remains, emit blocker `locator_unverified`.

- [ ] **Step 2: Write compiler golden tests**

Cover:

- navigation becomes `open-url`;
- a recorded `waitFor` becomes an explicit `wait-for` node immediately after navigation/click;
- secret fill remains `{{secret.login_password}}`;
- each recorded action preserves a stable ID and becomes one graph node;
- assertions come only from recorded assertions/test-plan expected outcomes;
- no Start edge branch/merge is generated;
- missing source coverage tag emits blocker `business_rule_uncovered`;
- write action without screenshot evidence emits blocker `write_action_unverified`;
- a graph with blocker cannot move to `needs_review`.

- [ ] **Step 3: Add the HCNS filter behavior fixture test**

Model the source-derived rule:

```ts
{
  id: "selected-user-scopes-daily-task",
  statement: "Calendar and recurring-task modal show tasks for selectedUserId",
  evidenceIds: ["source-calendar-filter", "source-modal-filter"],
  requiredCoverageTags: ["assign-target-user", "select-target-user-filter", "verify-target-user-task"]
}
```

First compile a trace missing `select-target-user-filter` and expect a blocker. Then add the filter action and expect a valid graph whose verification happens after selecting the assigned employee.

- [ ] **Step 4: Confirm RED**

Run focused compiler tests. Expected: compiler modules absent.

- [ ] **Step 5: Implement pure deterministic compilation**

The compiler must not call fetch, filesystem, browser, MCP, LLM or database. It must:

1. sort actions by recorded sequence;
2. select the highest-ranked unique verified locator;
3. insert explicit waits only from `waitFor` observations;
4. map actions to Phase 2 node data;
5. lay out nodes left-to-right at fixed 300 px intervals;
6. connect one linear edge chain from Start;
7. collect blockers/warnings without silently dropping an action;
8. run `validateGraph()` and `compileGraph()` as final consistency checks.

- [ ] **Step 6: Connect compile route and persist the draft**

Compile from repository snapshot, persist `draft_graph` and diagnostics atomically, append a `draft_compiled` event containing only IDs/summary and return the full result to UI/MCP.

- [ ] **Step 7: Run compiler and regression tests**

Run `skwf test`. Expected: all tests pass; worker source/image unchanged.

---

### Task 7: Store and serve authoring screenshots safely

**Files:**
- Create: `apps/workflow-web/features/authoring/artifacts.ts`
- Create: `apps/workflow-web/features/authoring/artifacts.test.ts`
- Create: `apps/workflow-web/app/api/authoring/sessions/[sessionId]/artifacts/route.ts`
- Create: `apps/workflow-web/app/api/authoring/artifacts/[sessionId]/[...path]/route.ts`
- Modify: `infra/docker-compose.workflow.yml`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `storeAuthoringArtifact({ sessionId, bytes, mimeType, label }): ArtifactReference`.
- Produces: confined read path below `.local-data/authoring-artifacts/<sessionId>/`.
- Consumes: Task 5 `authoring_attach_artifact` multipart upload.

- [ ] **Step 1: Write artifact security tests**

Assert PNG/JPEG up to 5 MiB succeeds; SVG/HTML/executable content, mismatched magic bytes, traversal path and wrong session fail. Assert filenames are server-generated UUIDs and original local path is never persisted.

- [ ] **Step 2: Confirm RED**

Run focused artifact tests. Expected: artifact storage module absent.

- [ ] **Step 3: Implement local artifact storage**

Use `ARTIFACTS_ROOT/authoring/<sessionId>`. Validate magic bytes, create the session directory, write with exclusive create mode and return `{ id, mimeType, relativePath, label }`.

- [ ] **Step 4: Add the smallest Compose mount change**

Reuse `.local-data/artifacts` and mount it as already configured; do not add a service, volume or image. Add only the env/path needed by web if current `ARTIFACTS_ROOT` is insufficient.

- [ ] **Step 5: Run tests and manually open a full-size artifact**

Upload one sanitized fixture, open its same-origin URL and verify browser response headers prevent content sniffing. Delete only the test artifact through test cleanup; preserve user artifacts.

---

### Task 8: Build the authoring review UI and approval gate

**Files:**
- Create: `apps/workflow-web/features/authoring/components/requirement-form.tsx`
- Create: `apps/workflow-web/features/authoring/components/source-evidence-list.tsx`
- Create: `apps/workflow-web/features/authoring/components/test-plan-view.tsx`
- Create: `apps/workflow-web/features/authoring/components/action-timeline.tsx`
- Create: `apps/workflow-web/features/authoring/components/decision-log.tsx`
- Create: `apps/workflow-web/features/authoring/components/review-gate.tsx`
- Create: `apps/workflow-web/features/authoring/components/authoring-panel.tsx`
- Create: `apps/workflow-web/features/authoring/components/authoring-panel.test.tsx`
- Modify: `apps/workflow-web/features/workflows/components/workflow-shell.tsx`
- Modify: `apps/workflow-web/features/workflows/components/workflow-editor-provider.tsx`
- Modify: `apps/workflow-web/app/projects/[projectId]/features/[featureId]/test-cases/[testCaseId]/page.tsx`

**Interfaces:**
- Produces: Authoring tab with requirement, source evidence, test plan, browser trace, decision log, diagnostics and draft graph preview.
- Produces: `applyApprovedGraph(graph)` on editor provider; draft preview cannot overwrite current graph before approval.
- Consumes: Task 4 snapshot API, Task 6 compiler result and Task 7 artifact URLs.

- [ ] **Step 1: Write review UI tests**

Assert:

- Start authoring requires requirement and configured source workspace key;
- source evidence shows relative path and line, never absolute path;
- badges distinguish `Source`, `Browser observed` and `Agent inferred`;
- screenshot opens a full-size modal;
- blocker disables Approve and links to the affected action/rule;
- write workflow always displays manual-review requirement;
- Reject requires a reason;
- draft graph remains preview-only until successful approval.

- [ ] **Step 2: Confirm RED**

Run focused component tests. Expected: components absent.

- [ ] **Step 3: Implement one Authoring tab inside the current shell**

Do not replace the Phase 2 editor. Add a third top-level mode `Workflow | Authoring | Runs`; keep the graph visible when reviewing a compiled draft. Use existing color/spacing tokens and existing full-size artifact modal behavior.

- [ ] **Step 4: Render audit information for human review**

For each decision show:

```text
Decision
Because
Evidence links
Confidence
Impact on generated steps
```

For each source-derived rule show whether its `requiredCoverageTags` are covered by recorded actions.

- [ ] **Step 5: Run UI and accessibility-oriented tests**

Run `skwf test`. Verify tab roles, dialog labels, keyboard focus and disabled approval state. No worker image build.

---

### Task 9: Approve an immutable workflow version without starting a run

**Files:**
- Create: `apps/workflow-web/features/authoring/approval-service.ts`
- Create: `apps/workflow-web/features/authoring/approval-service.test.ts`
- Create: `apps/workflow-web/app/api/authoring/sessions/[sessionId]/approve/route.ts`
- Modify: `apps/workflow-web/features/workflows/runs/run-service.ts`
- Modify: `apps/workflow-web/features/workflows/runs/run-service-server.ts`
- Modify: `apps/workflow-web/features/authoring/components/review-gate.tsx`

**Interfaces:**
- Produces: `approveAuthoringSession({ sessionId, expectedUpdatedAt }): Promise<WorkflowVersionRecord>`.
- Produces: `RunService.createVersion({ testCaseId, graph })` separate from `startTestCaseRun()`.
- Consumes: validated draft graph and existing version port.

- [ ] **Step 1: Write approval transaction tests**

Assert:

- approval fails when diagnostics contain a blocker;
- approval fails when source status is incomplete;
- approval fails if `expectedUpdatedAt` is stale;
- approval creates exactly one version on double-click/retry;
- graph and compiled workflow share the new version ID;
- session stores `approved_workflow_version_id` and becomes terminal;
- approval does not enqueue a run;
- subsequent `replayRun` uses the immutable version even if editable graph changes.

- [ ] **Step 2: Confirm RED**

Run focused service tests. Expected: approval service/create-version API absent.

- [ ] **Step 3: Extract version creation from run start**

Refactor `startTestCaseRun()` to call the new `createVersion()` and then worker start. Preserve all Phase 2 behavior and tests. Do not alter worker HTTP contract.

- [ ] **Step 4: Implement atomic approval**

Lock the authoring session row `FOR UPDATE`, verify status and `updated_at`, create the immutable version, update the editable test-case graph, set session approved/version ID and append `approved` event in one database transaction.

- [ ] **Step 5: Connect UI approval**

On success, replace the editor graph with the approved graph, mark it saved and show version number. Run remains a separate explicit user action so approval cannot accidentally write to the tested application.

- [ ] **Step 6: Run all web/contract tests**

Run `skwf test`. Expected: Phase 2 Run/Run again tests still pass and approval tests pass.

---

### Task 10: Prove the source-first HCNS authoring flow and deterministic replay

**Files:**
- Create: `apps/workflow-web/tests/fixtures/hcns-authoring.ts`
- Create: `apps/workflow-web/tests/acceptance/run-authoring-acceptance.mjs`
- Modify: `scripts/skwf`
- Modify: `README.md`

**Interfaces:**
- Produces: `skwf authoring-test` for repeatable contract/repository/compiler tests.
- Produces: `skwf authoring-acceptance` for end-to-end local acceptance.
- Consumes: all previous tasks.

- [ ] **Step 1: Create a sanitized HCNS fixture**

The fixture must represent, without credentials or production data:

- requirement: login, open calendar, create one daily task for an employee and verify it;
- source evidence showing both calendar and management modal depend on `selectedUserId`;
- test plan that assigns a target employee, selects the same employee in the filter, then verifies the task;
- recorded locators and waits after login/page navigation;
- before/after screenshots with generated fixture content;
- placeholder variables `{{username}}`, `{{secret.login_password}}`, `{{task_title}}`, `{{assignee_name}}`.

- [ ] **Step 2: Write end-to-end acceptance assertions**

The script must prove:

1. create authoring session from the short requirement;
2. browser discovery is blocked before source analysis;
3. append source evidence/business rule/test plan;
4. append browser actions and artifact references;
5. compile a valid draft with no blockers;
6. review snapshot explains why the employee filter step exists;
7. approve one immutable version;
8. invoke replay twice using that version;
9. compare worker requests and prove no authoring/MCP endpoint is called during replay;
10. verify both runs retain separate run IDs and artifacts.

- [ ] **Step 3: Confirm RED**

Run `skwf authoring-acceptance`. Expected: command/fixture absent.

- [ ] **Step 4: Add short launcher commands**

Extend usage to:

```text
skwf {dev|test|authoring-test|acceptance|authoring-acceptance|worker-acceptance|status|stop}
```

Both new commands resolve repository root from the installed launcher and work from any folder. They must use foreground Compose workflows with cleanup trap and must not use `-d`.

- [ ] **Step 5: Run deterministic acceptance**

Run `skwf authoring-acceptance`. Expected: PASS with one approved version and two successful, isolated replays. The acceptance test uses sanitized local fixtures; it must not write to HCNS production.

- [ ] **Step 6: Optional live HCNS validation gate**

If the user explicitly authorizes a live test, run only the approved workflow against the supplied production URL with runtime secrets entered at execution time. Before the write action, report the exact employee/task/date scope. Do not store credentials, and do not treat this optional live test as necessary for Phase 3 automated acceptance.

- [ ] **Step 7: Document the operator flow**

README must show:

```text
1. Start local stack: skwf dev
2. Configure local MCP with WORKFLOW_WEB_URL and SENDKIT_SOURCE_WORKSPACES
3. Give agent a short requirement plus project/testCase identity
4. Review Source evidence → Test plan → Browser trace → Decisions → Draft graph
5. Approve version
6. Run or Run again without agent
```

Include a clear warning that source workspace mappings stay on the laptop and are not sent to Vercel.

---

## Verification Matrix

| Boundary | Proof | Expected result |
| --- | --- | --- |
| Contract | `skwf authoring-test` | strict schemas; plaintext secrets rejected |
| Source access | traversal/symlink tests | only allowlisted roots; no absolute paths returned |
| Source-first | service tests | browser discovery blocked until source complete/unavailable reason recorded |
| Auditability | repository/service tests | ordered append-only events reconstruct decisions and evidence |
| Compiler | golden tests | same structured trace always yields same linear graph |
| Business behavior | HCNS fixture | missing employee-filter step blocks compile; covered trace passes |
| Review | component tests | blockers disable approval; screenshots and evidence are inspectable |
| Immutability | approval tests | one approved session maps to one immutable version |
| Replay boundary | acceptance | two replays call worker only; no MCP/agent/LLM call |
| Regression | `skwf test` | existing Phase 2 graph/run/evidence tests pass |

## Implementation Checkpoints

1. **Checkpoint A — Contract and storage design:** Tasks 1–2 reviewed; stop before migration image build.
2. **Checkpoint B — Agent adapter:** Tasks 3–5 prove local agent can create and populate a session through MCP.
3. **Checkpoint C — Compiler:** Task 6 proves source-informed trace compiles deterministically.
4. **Checkpoint D — Human control:** Tasks 7–9 prove review and immutable approval without auto-run.
5. **Checkpoint E — MVP proof:** Task 10 proves replay twice without authoring agent.

## Phase 3 Definition of Done

- A local agent can start from one short requirement without SendKit embedding an LLM API.
- Source evidence is captured before UI actions, or source unavailability is explicitly visible.
- The system records scope, source findings, test cases, UI actions, locators, artifacts and decisions with provenance.
- The HCNS employee-filter behavior is represented as a source-derived rule and affects the generated workflow.
- Compiler output is deterministic, linear and accepted by Phase 2 graph validation/compilation.
- Plaintext secrets are rejected and runtime secrets remain placeholders.
- User can inspect full-size evidence and understand why every important step exists.
- Write workflows cannot be approved without manual review.
- Approval creates one immutable `WorkflowVersion` but does not automatically run it.
- Run/Run again uses the existing worker and does not call agent, MCP authoring tools or LLM.
- All tests and sanitized local acceptance pass.
- No VPS, remote MCP, Supabase, cloud dispatch or extra runtime platform is introduced.

## Execution Notes

- Recommended execution style for this repository: **Inline Execution** with review at each checkpoint, because the worktree already contains uncommitted Phase 0–2 changes and the user has prohibited a new worktree.
- Do not follow the generic per-task commit suggestion from the writing-plan skill unless the user later explicitly asks for commits.
- The only planned Docker image impact is Task 2 migration 005. All later web changes use hot reload; local MCP is built as a package, and the Playwright worker remains unchanged.
