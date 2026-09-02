ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS source_workspace_key TEXT;

CREATE TABLE IF NOT EXISTS authoring_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_case_id UUID NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  requirement TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'drafting',
  risk_level TEXT NOT NULL DEFAULT 'write',
  source_status TEXT NOT NULL DEFAULT 'pending',
  draft_graph JSONB,
  diagnostics JSONB NOT NULL DEFAULT '[]'::jsonb,
  approved_workflow_version_id TEXT REFERENCES workflow_versions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT authoring_sessions_status_check CHECK (status IN ('drafting', 'source_review', 'browser_discovery', 'needs_review', 'approved', 'rejected', 'failed', 'cancelled')),
  CONSTRAINT authoring_sessions_risk_level_check CHECK (risk_level IN ('read_only', 'write', 'destructive')),
  CONSTRAINT authoring_sessions_source_status_check CHECK (source_status IN ('pending', 'complete', 'unavailable'))
);

CREATE INDEX IF NOT EXISTS authoring_sessions_test_case_created_at_index
  ON authoring_sessions(test_case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS authoring_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES authoring_sessions(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT authoring_events_session_sequence_unique UNIQUE(session_id, sequence)
);

CREATE INDEX IF NOT EXISTS authoring_events_session_sequence_index
  ON authoring_events(session_id, sequence);
