# Phase 1 — Local Docker Playwright Runner

## Summary

Xây một worker chạy Playwright trực tiếp trong Docker trên máy local. Worker tự quản lý browser/context/page, nhận workflow JSON cố định, thực thi tuần tự, ghi trạng thái, screenshot, trace và report. Phase này chưa có Agent, Stagehand, Browserbase, Vercel, Supabase, Telegram, VPS, remote MCP, Redis hoặc BullMQ.

Implementation target: `/Users/macos/Desktop/WorkSpace/FontEnd/sendkit`. SendKit là repository chính duy nhất; `browser-automation-app` chỉ là nguồn tham khảo, không đồng bộ code hai chiều. Chi tiết quyết định hợp nhất nằm ở [design spec workflow worker](../specs/2026-09-01-sendkit-workflow-worker-consolidation-design.md).

## Implementation changes

### 1. Local Docker runtime

Tạo runtime local:

```text
workflow-worker
postgres
```

`workflow-worker` chứa Node.js, Playwright trực tiếp, Chromium, deterministic executor, HTTP API nội bộ, artifact writer và run-state updater. PostgreSQL lưu trạng thái run trong local MVP; chưa dùng Neon, Supabase hoặc Trigger.dev.

Volume dữ liệu:

```text
./.local-data/postgres
./.local-data/artifacts
```

Worker chạy `concurrency = 1`. Không dùng filesystem tạm của container để lưu artifact lâu dài. Không build hoặc chạy container khi chưa được người dùng cho phép rõ ràng.

### 2. Workflow và run data

Bổ sung schema local:

```text
workflow_versions
test_runs
step_runs
artifacts
```

`TestRun` có `runId`, `workflowVersionId`, `status`, `startedAt`, `finishedAt` và `error`.

`StepRun` có `runId`, `stepId`, `type`, `status`, `startedAt`, `finishedAt`, `durationMs`, `error` và `metadata`.

`Artifact` có `runId`, `stepId`, `type`, `path`, `mimeType` và `createdAt`.

Phase 1 dùng workflow fixture `Login thành công`, gồm `open_url`, `fill`, `click`, `expect_visible` và `screenshot`.

### 3. Deterministic executor

Tạo executor dùng trực tiếp Playwright, không import hoặc khởi tạo Stagehand/Browserbase. Worker tự tạo browser, context và page bằng Playwright:

```text
open_url       → page.goto()
click          → locator.click()
fill           → locator.fill()
select         → locator.selectOption()
wait_for       → locator.waitFor()
expect_visible → expect(locator).toBeVisible()
expect_text    → expect(locator).toHaveText()
screenshot     → page.screenshot()
```

Executor chỉ nhận workflow đã compile:

```json
{
  "workflowVersionId": "login-v1",
  "steps": [
    {
      "id": "step-1",
      "type": "open_url",
      "url": "{{baseUrl}}/login"
    },
    {
      "id": "step-2",
      "type": "fill",
      "locator": {
        "strategy": "test_id",
        "value": "email"
      },
      "value": "{{email}}"
    }
  ]
}
```

Executor không được nhận requirement tự nhiên, gọi LLM/Agent/Stagehand, tự tìm selector thay thế, tự thêm/xóa step hoặc sửa workflow khi chạy.

### 4. Worker API

Worker cung cấp:

```text
POST /runs
GET  /runs/:runId
GET  /runs/:runId/steps
POST /runs/:runId/cancel
GET  /health
```

`POST /runs` nhận:

```json
{
  "workflowVersionId": "login-v1",
  "baseUrl": "http://app-under-test:3000",
  "variables": {
    "email": "test@example.com",
    "password": "{{secret.login_password}}"
  }
}
```

API trả ngay:

```json
{
  "runId": "run-001",
  "status": "queued"
}
```

Worker không giữ request mở trong lúc browser chạy.

```text
TestRun: queued → running → passed | failed | cancelled
StepRun: pending → running → passed | failed | skipped
```

Nếu một step fail, step hiện tại thành `failed`, các step sau thành `skipped`, và `TestRun` thành `failed`.

### 5. Artifact và observability

Trước và sau mỗi browser action, lưu screenshot. Mỗi run lưu Playwright trace, HTML report, worker log và browser metadata.

```text
.local-data/artifacts/<runId>/
├─ steps/<stepId>-before.png
├─ steps/<stepId>-after.png
├─ trace.zip
├─ run.log
└─ report.html
```

Mỗi log event có `runId`, `stepId`, `event`, `timestamp` và `status`. Không ghi password hoặc secret plaintext vào log, database hay report.

### 6. Container networking

Workflow nhận `baseUrl`, không hard-code URL:

```text
App chạy trên host:
  http://host.docker.internal:<port>

App chạy trong Compose:
  http://<service-name>:<port>
```

Worker không được giả định `localhost` bên trong container là máy host.

### 7. Tái sử dụng source tham khảo

Chỉ tham khảo workflow graph/type, node registry, validation pattern, Drizzle database layer, topological ordering và naming/status của run console từ `browser-automation-app`; implementation được viết và quản lý trong SendKit.

Không đưa Stagehand, Browserbase, Trigger.dev, Liveblocks, Clerk billing hoặc Agent node runtime vào deterministic runner. Các phần hiện tại chưa cần bị xóa; runner mới được xây tách biệt để không phá flow cũ.

## Test plan

### Unit tests

```text
[ ] Parse workflow hợp lệ
[ ] Reject workflow thiếu step
[ ] Resolve locator test_id và role
[ ] Interpolate variables
[ ] Reject step type không hỗ trợ
[ ] Xử lý step timeout
[ ] Step fail làm các step sau skipped
```

### Executor tests

Dùng app test tối giản có login page, email/password input, login button và dashboard marker.

```text
[ ] open_url chạy đúng
[ ] fill ghi đúng dữ liệu
[ ] click thực hiện đúng
[ ] expect_visible pass khi dashboard xuất hiện
[ ] expect_visible fail khi dashboard không xuất hiện
[ ] screenshot được tạo
[ ] trace.zip được tạo
```

### Worker API tests

```text
[ ] GET /health trả worker ready
[ ] POST /runs trả runId ngay
[ ] Run chuyển queued → running
[ ] Run thành công chuyển passed
[ ] Run lỗi chuyển failed
[ ] Đọc được step status
[ ] Cancel không tạo run mới
[ ] Hai run không ghi đè artifact
```

### Replay acceptance test

Chạy cùng một `WorkflowVersion` ít nhất hai lần và cả hai phải pass. Số lần gọi LLM, Agent và Stagehand trong replay phải bằng 0.

Sau đó đổi locator thành sai và xác nhận run fail tại đúng step, có error, screenshot và trace; các step sau chuyển thành `skipped`.

## Completion criteria

```text
[x] Worker chạy được trong Docker
[x] Không cần cài node_modules trên host
[x] PostgreSQL local lưu được run state
[x] Worker chạy được login workflow
[x] Mỗi step có status riêng
[x] Có screenshot trước/sau step
[x] Có trace và HTML report
[x] Replay cùng WorkflowVersion được nhiều lần
[x] Replay không gọi LLM/Agent/Stagehand
[x] Xác định chính xác step bị lỗi
[x] Artifact giữa các run không bị ghi đè
[x] Worker xử lý được timeout và browser failure
```

## Assumptions và constraints

- Phase 1 chỉ triển khai local execution.
- Worker chạy concurrency 1.
- PostgreSQL local được dùng để giữ schema tương thích với Supabase về sau.
- Artifact lưu trong Docker volume local.
- UI workflow hoàn chỉnh được tích hợp ở Phase 2.
- Agent authoring và workflow compiler bắt đầu ở Phase 3.
- Không thêm Redis/BullMQ trước khi local runner chứng minh được nhu cầu.
- Không deploy Vercel, Supabase, VPS hoặc remote MCP trong phase này.
- Không tạo worktree mới, không commit/push và không cài dependency/build Docker nếu chưa được người dùng cho phép.
