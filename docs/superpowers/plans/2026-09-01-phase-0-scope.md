# Phase 0 — Chốt scope và contract cho Workflow Testing MVP

## Summary

Phase 0 chỉ tạo specification và contract; chưa triển khai Docker worker, chưa sửa workflow engine và chưa tích hợp Vercel/Supabase. Mục tiêu là khóa phạm vi đủ rõ để Phase 1 xây Local Docker Playwright Runner mà không phải đổi kiến trúc giữa chừng.

Source tham chiếu:

- `docs/architecture/system-flows.md`
- `/Users/macos/Desktop/WorkSpace/FontEnd/browser-automation-app/lib/db/schema.ts`
- `/Users/macos/Desktop/WorkSpace/FontEnd/browser-automation-app/features/workflows/tasks/run-workflow.ts`

## Phase 0 workstreams

### 0.1. Mục tiêu MVP và non-goals

MVP phải chứng minh được:

```text
Requirement
→ Agent tạo workflow
→ Compiler tạo step cụ thể
→ Validation chạy thành công
→ User bấm Run
→ Playwright replay từng step
→ Replay không gọi agent
→ UI hiển thị screenshot, trace và kết quả
```

Chưa nằm trong MVP: VPS, remote MCP, Telegram control, n8n, Trigger.dev, Browserbase trong replay, multi-worker, parallel execution và self-healing selector.

### 0.2. Test case chuẩn

Dùng một project mẫu và một test case duy nhất:

```text
Project: Browser Automation Demo
Feature: Authentication
TestCase: Login thành công
```

Workflow gồm: open login page, fill email, fill password, click login và assert dashboard visible.

### 0.3. Authoring và Replay

Authoring mode cho phép agent đọc requirement, khám phá UI, gọi browser tool, đề xuất locator và tạo workflow.

Replay mode chỉ đọc `WorkflowVersion` đã approved và thực thi bằng Playwright. Replay không được phân tích lại requirement, tự thêm step, tự đổi selector hoặc gọi LLM.

### 0.4. Node catalog v0

Node deterministic bắt buộc:

```text
start
open_url
click
fill
select
wait_for
expect_visible
expect_text
screenshot
```

Các node `agent`, `act`, `observe`, `extract` chỉ được dùng ở authoring/khám phá và phải được compile trước khi replay.

### 0.5. Workflow schema và compiler boundary

Workflow phải được phân cấp:

```text
Project → Feature → TestCase → Workflow → WorkflowVersion
```

Mỗi step có `stepId`, `type`, locator hoặc URL, input/value, expected result nếu là assertion và timeout.

Agent quyết định test scope và hướng thao tác. Recorder ghi action thực tế, locator resolved và artifact. Compiler chuẩn hóa action, chọn locator, tách biến, tạo assertion và đánh dấu step còn phụ thuộc LLM.

Locator ưu tiên: `test_id`, `role + name`, `label`, `name/id`, CSS, XPath.

### 0.6. Local Docker runtime

MVP chạy hoàn toàn local:

```text
workflow-app
workflow-worker
postgres
```

Worker container có Node.js, Playwright, Chromium, workflow executor, screenshot, trace và artifact writer. Chỉ chạy một workflow tại một thời điểm; chưa dùng Redis, BullMQ, Realtime, public domain hoặc ngrok.

### 0.7. Worker contract

Worker nhận `runId`, `workflowVersionId`, variables và `baseUrl`. Worker trả trạng thái từng step gồm `stepId`, status, duration, error và artifact paths.

Trạng thái cần chốt:

```text
Workflow: draft → compiled → validated → approved → archived
TestRun: queued → running → passed | failed | cancelled
StepRun: pending → running → passed | failed | skipped
```

### 0.8. Observability và secrets

Mỗi step lưu action, locator, URL, status, duration, error, before screenshot và after screenshot. Mỗi run lưu workflow version, browser version, base URL, environment, Playwright trace và HTML report. Video là tùy chọn sau MVP.

Secret không được lưu plaintext trong workflow, log hoặc screenshot. Dùng biến như `{{email}}` và `{{secret.login_password}}`.

### 0.9. Phân loại project và test

Mỗi run phải biết chính xác:

```text
projectId
featureId
testCaseId
workflowVersionId
runId
stepId
```

Không suy luận project hoặc test case từ tên workflow.

### 0.10. Acceptance criteria

Phase 0 hoàn tất khi tài liệu trả lời được mục tiêu MVP, test case mẫu, node catalog, workflow schema, compiler boundary, worker input/output, state machine, artifact contract, secret rules, hierarchy project/feature/test case và non-goals.

Acceptance cho Phase 1:

```text
[ ] Docker worker khởi động được
[ ] Worker chạy được workflow login
[ ] Worker chạy step đúng thứ tự
[ ] Replay lần hai không gọi LLM
[ ] Step fail có screenshot và trace
[ ] Có thể chạy lại cùng WorkflowVersion
[ ] Kết quả phân biệt được theo runId
```

## Phase 0 không thực hiện

- Không tạo VPS, remote MCP, Telegram control, n8n hoặc Trigger.dev.
- Không deploy Vercel hoặc tạo Supabase project.
- Không tạo Dockerfile, build container/image hoặc cài thêm `node_modules`.
- Không tạo worktree mới.
- Không thực hiện GitHub/remote workflow, commit hoặc push.

## Kết quả bàn giao

Phase 0 bàn giao tài liệu này làm source of truth cho Phase 1. Phase 1 bắt đầu bằng Local Docker Playwright Runner.
