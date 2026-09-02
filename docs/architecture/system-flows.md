# SendKit — Sơ đồ flow hệ thống

Tài liệu này giải thích hệ thống theo cách đơn giản, đồng thời phân biệt rõ:

- **Current**: đã có trong source hiện tại.
- **Planned**: kiến trúc mục tiêu, chưa có trong source hiện tại.

## 1. Bức tranh tổng quan

Hãy hình dung SendKit là một trạm điều phối:

- **Local** là bàn làm việc chính: nơi viết code và giữ workspace đầy đủ.
- **VPS** là trợ lý chạy nền: nhận task, deploy và test bằng Playwright.
- **Database** là sổ điều phối chung: lưu task, quyết định, tiến độ và event.
- **Telegram** là remote control: giao việc, nhận báo cáo và trả lời khi agent bị stuck.
- **GitHub** là nơi đồng bộ code bằng commit/branch.

```mermaid
flowchart TB
    User[Người dùng]

    subgraph Channels[Kênh làm việc]
        direction LR
        Phone[Điện thoại] --> Telegram[Telegram bot]
        Terminal[Terminal local] --> Local[Local agent<br/>workspace chính]
    end

    subgraph Coordination[Lớp điều phối — planned]
        direction LR
        API[Shared Context & Task API] <--> DB[(PostgreSQL)]
    end

    subgraph Execution[Lớp thực thi]
        direction LR
        VPS[VPS agent<br/>Playwright / deploy]
        GitHub[GitHub]
        Vercel[Vercel preview/prod]
    end

    User --> Channels
    Telegram <-->|commands / reports| API
    Local <-->|context / task sync| API
    API <-->|job dispatch / events| VPS
    Local -->|push commit| GitHub
    VPS -->|checkout / report| GitHub
    VPS -->|deploy / test| Vercel
```

> Trong source hiện tại chưa có `Shared Context & Task API`, PostgreSQL, queue, VPS agent orchestration hoặc Telegram inbound flow. Đây là các thành phần cần bổ sung.

## 2. Những gì source hiện tại đang có

Cả Local MCP và Remote MCP đều expose cùng một tool `telegram`, rồi gọi chung operation trong `packages/core`.

```mermaid
flowchart TD
    Core[packages/core<br/>sendTelegramMessage]
    TelegramAPI[Telegram Bot API]

    LocalClient[MCP client local] -->|stdio| LocalMCP[packages/local-mcp]
    LocalMCP -->|validate + bot token từ env| Core

    RemoteClient[ChatGPT web / Claude web / MCP client] -->|HTTP + Clerk OAuth| RemoteMCP[apps/remote-mcp]
    RemoteMCP -->|validate + bot token từ URL| Core

    CLI[sendkit CLI] -->|local command + token config| Core
    Core -->|POST sendMessage| TelegramAPI
```

### Current: Local MCP

```mermaid
sequenceDiagram
    participant Agent as Terminal agent
    participant Host as MCP host
    participant MCP as sendkit-mcp local
    participant Core as sendkit-core
    participant TG as Telegram API

    Agent->>Host: Người dùng yêu cầu gửi Telegram
    Host->>MCP: Gọi tool telegram qua stdio
    MCP->>MCP: Đọc TELEGRAM_BOT_TOKEN
    MCP->>Core: Validate chatId + message
    Core->>TG: POST /bot.../sendMessage
    TG-->>Core: message_id
    Core-->>MCP: { ok, chatId, messageId }
    MCP-->>Host: Trả kết quả tool
    Host-->>Agent: Báo đã gửi
```

Local MCP là một process chạy trên cùng máy với MCP host. Nó chưa lưu session, project context hoặc task history.

### Current: Remote MCP

```mermaid
sequenceDiagram
    participant Client as Remote MCP client
    participant Server as Remote MCP HTTP server
    participant Clerk as Clerk OAuth
    participant Core as sendkit-core
    participant TG as Telegram API

    Client->>Server: POST /:botToken/mcp + Bearer token
    Server->>Clerk: authenticateRequest()
    Clerk-->>Server: Authenticated / Unauthorized
    alt Unauthorized
        Server-->>Client: 401 + WWW-Authenticate
    else Authenticated
        Client->>Server: Gọi tool telegram
        Server->>Core: Validate input + thêm botToken
        Core->>TG: POST /bot.../sendMessage
        TG-->>Core: message_id
        Core-->>Server: Kết quả gửi
        Server-->>Client: MCP response
    end
```

Remote MCP hiện là HTTP gateway có Clerk authentication. Nó chưa phải cloud agent runner và cũng chưa có memory/session persistence.

## 3. Kiến trúc context và task mục tiêu

Nên tách hai loại dữ liệu:

```text
Session context
- Nội dung trao đổi cần nhớ
- Mục tiêu
- Quyết định và lý do
- Context summary

Task state
- Task đang ở trạng thái nào
- Agent nào đang xử lý
- Commit nào là input
- Test/deploy result
- Dependency hoặc blocker
```

Tách model không có nghĩa là local không nhìn thấy task. Khi local sync, backend sẽ ghép các task update liên quan vào context hiện tại.

```mermaid
flowchart LR
    subgraph SessionContext[Session context]
        direction TB
        Session[Project session]
        Transcript[Transcript đầy đủ]
        Summary[Context summary]
        Decisions[Decisions + reasons]
        Session --> Transcript
        Session --> Summary
        Session --> Decisions
    end

    subgraph TaskState[Task state]
        direction TB
        Task[Task state]
        Events[Task events]
        Task --> Events
    end

    Composer[Context composer<br/>ghép phần liên quan]
    Update[Context update cho agent]
    Agent[Local/VPS agent]

    Transcript --> Composer
    Summary --> Composer
    Decisions --> Composer
    Events --> Composer
    Composer --> Update --> Agent
```

Database trung tâm là nguồn sự thật cho việc điều phối. Local vẫn là nơi giữ source code và full workspace chính.

## 4. Local mở máy lại và sync kết quả cũ

Local không cần giữ kết nối liên tục để không mất kết quả. Agent lưu một cursor, ví dụ `lastEventId`, rồi lấy các event mới khi khởi động hoặc ở checkpoint.

```mermaid
sequenceDiagram
    participant Local as Local agent
    participant API as Context & Task API
    participant DB as PostgreSQL

    Local->>API: sync(projectId, sinceEventId)
    API->>DB: Lấy event chưa đọc
    DB-->>API: Task results + decisions + status updates
    API-->>Local: Context update + nextEventId
    Local->>Local: Ghép update vào session context
    Local->>API: acknowledge(nextEventId)
```

Ví dụ local có thể nhận được:

```text
Task A — VPS test commit abc123
- 23 test passed
- 1 test failed
- Có screenshot và log
- Đề xuất kiểm tra checkout flow
```

## 5. Local làm task B trong khi VPS test task A

Task A và task B phải có định danh riêng. VPS test đúng commit đã được giao, không test một working tree local đang thay đổi.

```mermaid
sequenceDiagram
    participant Local as Local agent
    participant GH as GitHub
    participant API as Task API
    participant VPS as VPS agent
    participant DB as PostgreSQL
    participant TG as Telegram

    Local->>Local: Hoàn thành phần cần test của task A
    Local->>GH: Push feature/task-a @ abc123
    Local->>API: Create Task A(inputCommitSha=abc123)
    API->>DB: Task A = queued
    API->>VPS: Queue Task A
    Local->>Local: Tiếp tục task B trên branch khác
    VPS->>GH: Checkout abc123
    VPS->>VPS: Deploy preview + chạy Playwright
    VPS->>DB: Ghi Task A result/events
    VPS->>TG: Gửi report task A
    Local->>API: Sync event mới ở checkpoint kế tiếp
    API-->>Local: Task A completed/failed
```

Kết quả task A không nên nằm trong queue cho đến khi task B hoàn tất. Kết quả phải được ghi vào database ngay. Nếu task B không phụ thuộc A, local tiếp tục B bình thường.

Nếu B phụ thuộc A:

```text
Task B.dependsOn = Task A
Task B.status = blocked

Task A completed
→ backend phát event
→ B được mở khóa
→ agent tiếp tục B
```

## 6. VPS giao task từ Telegram

Telegram không chỉ gửi notification; trong kiến trúc mục tiêu nó là giao diện điều khiển hai chiều.

```mermaid
sequenceDiagram
    participant User as Người dùng trên điện thoại
    participant TG as Telegram bot
    participant API as Task API
    participant DB as PostgreSQL
    participant Queue as Job queue
    participant VPS as VPS agent

    User->>TG: /task Test checkout trên commit abc123
    TG->>API: Parse command + xác định project
    API->>DB: Tạo task + TaskCreated event
    API->>Queue: Enqueue task
    Queue->>VPS: Deliver task
    VPS->>DB: TaskStarted + progress events
    VPS->>VPS: Deploy/test bằng Playwright
    VPS->>DB: TaskCompleted/TaskFailed
    VPS->>TG: Gửi report
```

Source hiện tại chưa có Telegram webhook/long polling, command parser, queue hoặc VPS worker. `telegram` hiện chỉ là chiều agent → Telegram.

## 7. Local bị stuck và cần user quyết định

Khi local agent chạy vào rule yêu cầu review, nó không nên chỉ đứng im. Nó phải ghi một `DecisionRequested` event và gửi notification.

```mermaid
sequenceDiagram
    participant Local as Local agent
    participant API as Context & Task API
    participant DB as PostgreSQL
    participant TG as Telegram bot
    participant User as Người dùng

    Local->>Local: Phát hiện migration cần review
    Local->>API: DecisionRequested(taskId, question, reason, options)
    API->>DB: Lưu decision request
    API->>TG: Gửi cảnh báo Telegram
    User->>TG: Chọn option 2
    TG->>API: Ghi DecisionMade
    API->>DB: Lưu quyết định + người trả lời
    alt Local agent đang online
        API-->>Local: Event/notification mới
        Local->>Local: Tiếp tục task theo option 2
    else Laptop đang tắt
        Note over DB: Quyết định chờ trong DB
        Local->>API: Sync khi laptop mở lại
        API-->>Local: Trả DecisionMade
        Local->>Local: Tiếp tục task
    end
```

Nếu local không gửi heartbeat:

```text
agent offline ≠ agent stuck
```

Backend chỉ có thể kết luận local offline khi heartbeat hết hạn. Muốn xác định stuck, local agent phải chủ động gửi `Blocked` hoặc `DecisionRequested`.

## 8. Cách các agent nhận update

Ở phiên bản đầu, polling là đủ và dễ vận hành:

```text
Local agent → get_task_updates(projectId, sinceCursor)
```

Sau này có thể dùng WebSocket hoặc SSE để nhận gần như real-time.

```mermaid
flowchart LR
    DB[(TaskEvent database)]
    Poll[Polling ở checkpoint]
    Stream[WebSocket/SSE<br/>planned]
    Local[Local agent]
    VPS[VPS agent]
    Telegram[Telegram notification worker]

    DB --> Poll --> Local
    DB --> Stream --> VPS
    DB --> Telegram
```

Queue nên dùng để phân phối job và notification. Database mới là nơi lưu kết quả lâu dài để agent offline vẫn sync lại được.

## 9. Context nào được gửi vào session?

Mỗi lần agent mở hoặc sync session, backend nên trả context theo lớp:

```text
1. Project summary
2. Session summary
3. Decisions còn hiệu lực
4. Task hiện tại của agent
5. Task update liên quan
6. Các event mới kể từ cursor trước
7. Transcript/memory chi tiết khi agent search thêm
```

Không nên nhét mọi task và toàn bộ transcript vào mọi request. Context nên được compose theo nhu cầu.

```mermaid
flowchart TD
    Query[Agent mở session hoặc hỏi câu mới]
    Project[Project summary]
    Session[Session summary]
    Task[Current task + related task updates]
    Decision[Active decisions]
    Search[Search transcript/memory nếu cần]
    Prompt[Context được compose]
    Agent[Agent tiếp tục làm việc]

    Query --> Project
    Query --> Session
    Query --> Task
    Query --> Decision
    Query --> Search
    Project --> Prompt
    Session --> Prompt
    Task --> Prompt
    Decision --> Prompt
    Search --> Prompt
    Prompt --> Agent
```

## 10. Phân chia nơi lưu dữ liệu

```text
PostgreSQL/Supabase
- projects, sessions, tasks
- transcript metadata và message
- decisions, task events, heartbeat
- context summaries

Object storage / GitHub / Vercel artifacts
- Playwright screenshots
- video, trace, log lớn
- build artifacts

GitHub
- source code
- branch, commit, pull request
- diff làm input chính xác cho test

Local machine
- working tree
- full workspace
- cache/full transcript lớn nếu cần
- local embeddings nếu muốn chạy offline
```

Supabase hoặc PostgreSQL trên VPS đều có thể làm database trung tâm. Source hiện tại chưa triển khai lựa chọn nào.

## 11. Tóm tắt flow mục tiêu

```mermaid
flowchart TB
    Start[Người dùng giao việc] --> Channel{Kênh nào?}

    subgraph Inputs[Đầu vào]
        direction LR
        LocalPrompt[Terminal local] --> LocalAgent[Local agent]
        TelegramPrompt[Telegram] --> API[Context & Task API]
    end

    subgraph Coordination[Điều phối]
        direction LR
        DB[(Shared PostgreSQL)]
        Queue[Job queue]
        API --> DB
        API --> Queue
    end

    subgraph Cloud[VPS execution]
        direction LR
        VPS[VPS agent]
        GH[GitHub commit/branch]
        Test[Playwright / Vercel test]
        Report[Report + artifacts]
        Queue --> VPS
        VPS --> GH
        VPS --> Test --> Report
    end

    Channel --> LocalPrompt
    Channel --> TelegramPrompt
    LocalAgent -->|checkpoint / task / decision / heartbeat| API
    Report --> DB
    DB -->|task updates| Sync[Local sync]
    Sync --> LocalAgent
    DB -->|notification| TelegramPrompt
    Decision[User decision] --> API
```

## 12. Nguyên tắc thiết kế

1. `projectId` và `taskId` là định danh điều phối; không dựa vào tên chat để phân biệt project.
2. `sessionId` của business không phụ thuộc vào vòng đời kết nối MCP.
3. Mọi task test phải tham chiếu commit SHA cụ thể.
4. Database lưu event ngay khi xảy ra; không chờ agent khác rảnh.
5. Queue dùng để giao việc/thông báo, không phải nơi duy nhất giữ kết quả.
6. Local offline thì event vẫn phải tồn tại để sync khi mở lại.
7. `blocked`, `offline`, `failed` và `waiting_review` là các trạng thái khác nhau.
8. Quyết định cần lưu cả nội dung và lý do để agent sau này hiểu vì sao.
9. Telegram là control/notification channel, không phải nguồn context duy nhất.
10. Vector search chỉ là lớp tìm kiếm bổ sung; dữ liệu structured và transcript gốc vẫn cần được lưu.
