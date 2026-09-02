# SendKit Workflow Worker Consolidation Design

## Status

Approved on 2026-09-01.

## Context

Phase 1 của local Playwright runner đã được chứng minh trong `/Users/macos/Desktop/WorkSpace/FontEnd/browser-automation-app`, nhưng SendKit mới là sản phẩm đích. Tiếp tục phát triển hai repository độc lập sẽ làm workflow schema, worker API, migrations, Docker image và UI dễ lệch phiên bản.

SendKit trở thành repository chính duy nhất. `browser-automation-app` chỉ còn là donor/reference trong migration; không tiếp tục nhận feature mới và không bị xóa hoặc chỉnh sửa trong migration này.

## Goals

- Chuyển Phase 1 deterministic Playwright worker vào SendKit.
- Chuyển source worker từ JavaScript `.mjs` sang TypeScript.
- Quản lý dependencies bằng Bun workspace và một root `bun.lock` duy nhất.
- Chạy Playwright bằng Node.js trong image Debian slim, chỉ cài Chromium.
- Khởi tạo PostgreSQL và artifact storage sạch trong SendKit.
- Giữ nguyên API và hành vi đã được chứng minh ở Phase 1.
- Giảm image từ 5.71 GB xuống không quá 2.2 GB.
- Không yêu cầu cài Bun hoặc `node_modules` trên host.

## Non-goals

- Không chuyển workflow UI từ `browser-automation-app` trong migration này.
- Không thêm Agent, LLM, Stagehand, Browserbase, Supabase, Vercel, VPS, remote MCP, Redis hoặc BullMQ.
- Không chuyển database hoặc artifacts thử nghiệm hiện có.
- Không xóa image cũ, source donor hoặc dữ liệu donor nếu chưa có phê duyệt riêng.
- Không thay đổi Telegram, CLI, local MCP hoặc remote MCP behavior hiện tại.

## Repository Layout

```text
sendkit/
├── apps/
│   ├── remote-mcp/
│   └── workflow-worker/
│       ├── package.json
│       ├── tsconfig.json
│       ├── Dockerfile
│       ├── src/
│       │   ├── executor.ts
│       │   ├── runner.ts
│       │   ├── server.ts
│       │   ├── service.ts
│       │   ├── store.ts
│       │   └── workflow.ts
│       ├── sql/
│       │   ├── 001_init.sql
│       │   ├── 002_step_run_uniqueness.sql
│       │   └── 003_redact_existing_variables.sql
│       └── tests/
├── packages/
│   └── workflow-contract/
│       ├── package.json
│       ├── tsconfig.build.json
│       ├── tsdown.config.ts
│       └── src/
│           ├── workflow.ts
│           ├── run.ts
│           └── index.ts
├── infra/
│   └── docker-compose.workflow.yml
├── .local-data/
│   ├── postgres/
│   └── artifacts/
└── bun.lock
```

`packages/workflow-contract` là source of truth cho workflow, run, step, locator và API payload. Worker consume package này bằng `workspace:*`; UI và MCP adapters ở phase sau phải dùng cùng package thay vì copy type.

## Runtime Boundaries

```text
Caller
  │ HTTP JSON
  ▼
workflow-worker :8787
  ├─ validates @cwa-dev/sendkit-workflow-contract
  ├─ queues runs with concurrency = 1
  ├─ executes deterministic Playwright steps
  ├─ writes screenshots/trace/report/log
  └─ persists run state
          │
          ▼
workflow-postgres :5432 (Compose network only)
```

The worker exposes:

```text
GET  /health
POST /runs
GET  /runs/:runId
GET  /runs/:runId/steps
POST /runs/:runId/cancel
```

`POST /runs` receives `baseUrl`, `variables` and a compiled workflow. It returns `{ runId, status: "queued" }` without holding the HTTP request open.

The replay runtime rejects unsupported or LLM-dependent step types. It never changes selectors, inserts steps or invokes Agent/Stagehand/Browserbase.

## Contract Model

The initial supported step types remain:

```text
open_url
click
fill
select
wait_for
expect_visible
expect_text
screenshot
```

Locators support `test_id`, `role`, `label`, `name`, `css` and `xpath`. Workflow variables use `{{path.to.value}}` interpolation.

Run state:

```text
queued → running → passed | failed | cancelled
```

Step state:

```text
pending → running → passed | failed | skipped
```

Only one `step_runs` row exists for each `(run_id, step_id)`. Terminal updates replace `running`; they do not append duplicate event rows.

## Data and Secret Handling

Fresh runtime data lives only under:

```text
sendkit/.local-data/postgres
sendkit/.local-data/artifacts
```

`.local-data/` is ignored by Git. PostgreSQL is project-private and has no host port. The worker connects through `workflow-postgres:5432` on the Compose network.

Runtime variable values are used in memory for execution. PostgreSQL persists the same keys with `[REDACTED]` values. Logs, reports and workflow versions must not contain plaintext passwords or secret values.

Every run writes to an isolated directory:

```text
.local-data/artifacts/<runId>/
├── steps/<stepId>-before.png
├── steps/<stepId>-after.png
├── trace.zip
├── report.json
├── report.html
└── run.log
```

## Bun Workspace and TypeScript

SendKit keeps one root `bun.lock`. New packages are:

```text
@cwa-dev/sendkit-workflow-contract
@cwa-dev/sendkit-workflow-worker
```

The contract package follows the existing SendKit `zod + tsdown` pattern. Worker source is TypeScript and is checked by root lint/typecheck. Docker uses Bun only in build/dependency stages and Node.js 22 in the final runtime, so Playwright runs on an officially supported Node environment.

The host does not need Bun. Lockfile updates, tests and builds run inside Dockerized Bun/build stages.

## Docker Image Design

The image uses a multi-stage build:

```text
oven/bun:1.2.22-debian
  ├─ frozen filtered workspace install
  ├─ contract/worker typecheck and tests
  └─ bundle worker TypeScript for Node
             │
             ▼
node:22-bookworm-slim
  ├─ production pg/playwright dependencies
  ├─ Chromium + Chromium system dependencies only
  ├─ compiled worker
  └─ SQL migrations
```

Playwright is pinned to `1.55.1`. The Docker build must assert that the package version used to install Chromium equals the runtime package version. Alpine is not used because Playwright browser builds depend on glibc.

Image acceptance:

```text
Target:      <= 2.0 GB
Hard gate:   <= 2.2 GB
Current:      5.71 GB
```

If the new image is larger than 2.2 GB, migration behavior may still be tested, but the image cannot replace the old worker tag until layer history identifies and removes the excess.

## Migration Strategy

Migration is checkpointed:

1. Add shared contract with failing/passing schema tests.
2. Port worker behavior to TypeScript with parity tests.
3. Add Bun workspace scripts and update only root `bun.lock` using Dockerized Bun.
4. Build the slim image under a new tag; do not overwrite or delete the old image.
5. Start a fresh SendKit PostgreSQL database and run complete acceptance.
6. Declare SendKit the only implementation target after parity and size gates pass.

No source or runtime data is copied back to `browser-automation-app`.

## Old Image and Donor Handling

The existing `browser-automation-phase1-workflow-worker:latest` image remains available during migration. The SendKit image uses a separate repository/tag:

```text
sendkit-workflow-worker:slim-v1
```

After acceptance, report both image IDs and sizes. The user has authorized deletion of the donor `.local-data/` only after SendKit fresh-data acceptance passes. Removing the old tag/image or pruning BuildKit cache still requires explicit user approval. Never run `docker system prune -a` for this migration.

`browser-automation-app` remains unchanged as a local reference until the user separately chooses to archive or remove it.

## Verification

Completion requires:

- Contract, executor, runner, service, store and server tests pass in Docker.
- Root SendKit lint and typecheck include the new TypeScript source and pass.
- Compose starts with a fresh PostgreSQL directory.
- Health endpoint returns ready.
- Same workflow version passes twice.
- Wrong locator fails at the expected step and later steps are skipped.
- Cancel remains cancelled.
- A second run remains queued while the first is running.
- PostgreSQL has one row per run/step and no plaintext secret values.
- Separate run directories contain screenshot, trace, JSON/HTML report and log.
- Worker image is no larger than 2.2 GB.
- Existing SendKit CLI/MCP tests and builds remain unaffected.

## References

- [Bun workspaces and filtered installs](https://bun.sh/docs/pm/workspaces)
- [Bun reproducible installs](https://bun.sh/docs/pm/cli/install)
- [Playwright browser installation](https://playwright.dev/docs/test-cli)
- [Playwright Docker guidance](https://playwright.dev/docs/next/docker)
