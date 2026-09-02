CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS projects_slug_unique ON projects(slug);

CREATE TABLE IF NOT EXISTS features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS features_project_slug_unique ON features(project_id, slug);

CREATE TABLE IF NOT EXISTS test_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  base_url TEXT NOT NULL,
  graph JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS test_cases_feature_slug_unique ON test_cases(feature_id, slug);

ALTER TABLE workflow_versions
  ADD COLUMN IF NOT EXISTS test_case_id UUID REFERENCES test_cases(id) ON DELETE SET NULL;

ALTER TABLE workflow_versions
  ADD COLUMN IF NOT EXISTS version_number INTEGER;

ALTER TABLE workflow_versions
  ADD COLUMN IF NOT EXISTS graph JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS workflow_versions_test_case_version_unique
  ON workflow_versions(test_case_id, version_number)
  WHERE test_case_id IS NOT NULL;
