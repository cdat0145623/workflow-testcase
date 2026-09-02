export const hcnsAuthoringFixture = {
  requirement: "Đăng nhập, tạo daily task cho một nhân viên và xác minh task theo bộ lọc nhân viên.",
  variables: ["{{username}}", "{{secret.login_password}}", "{{task_title}}", "{{assignee_name}}"],
  evidence: [
    { id: "source-calendar-filter", workspaceKey: "hcns", relativePath: "features/calendar/calendar.tsx", startLine: 42, endLine: 58, finding: "Calendar queries daily tasks with selectedUserId.", provenance: "source" as const },
    { id: "source-modal-filter", workspaceKey: "hcns", relativePath: "features/tasks/manage-modal.tsx", startLine: 71, endLine: 89, finding: "Management modal uses the same selectedUserId filter.", provenance: "source" as const },
  ],
  rule: { id: "selected-user-scopes-daily-task", statement: "Calendar and recurring-task modal show tasks for selectedUserId", evidenceIds: ["source-calendar-filter", "source-modal-filter"], requiredCoverageTags: ["assign-target-user", "select-target-user-filter", "verify-target-user-task"] },
  testPlan: { scope: "Create and verify one daily task under the assigned employee filter.", expectedOutcomes: ["The created task is visible only while the assigned employee filter is selected."], excludedScenarios: [], businessRules: [], riskLevel: "write" as const },
};
