UPDATE test_runs
SET variables = COALESCE(
  (SELECT jsonb_object_agg(key, to_jsonb('[REDACTED]'::text)) FROM jsonb_object_keys(test_runs.variables) AS key),
  '{}'::jsonb
)
WHERE variables <> '{}'::jsonb;
