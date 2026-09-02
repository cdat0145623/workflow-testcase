# Project-specific agent rules

## Local-first development constraints

- Không tạo worktree mới trong quá trình làm việc trên project này.
- Không build Docker container hoặc image mới nếu người dùng chưa cho phép rõ ràng.
- Không cài thêm hoặc thay đổi `node_modules` nếu người dùng chưa cho phép rõ ràng.
- Giai đoạn đầu ưu tiên chứng minh workflow chạy ổn định ở local trước khi triển khai VPS, remote MCP hoặc dịch vụ cloud bổ sung.
- Không tự thực hiện GitHub workflow, commit hoặc push khi người dùng chưa yêu cầu.
