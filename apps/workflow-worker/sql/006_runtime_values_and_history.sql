CREATE TABLE IF NOT EXISTS test_case_runtime_values (
  test_case_id UUID PRIMARY KEY REFERENCES test_cases(id) ON DELETE CASCADE,
  username TEXT NOT NULL DEFAULT '',
  password_ciphertext TEXT NOT NULL DEFAULT '',
  task_title TEXT NOT NULL DEFAULT '',
  assignee_name TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workflow_versions_test_case_number_idx
  ON workflow_versions(test_case_id, version_number DESC);

CREATE INDEX IF NOT EXISTS test_runs_workflow_version_created_idx
  ON test_runs(workflow_version_id, created_at DESC);
