WITH ranked_steps AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY run_id, step_id ORDER BY id DESC) AS row_number
  FROM step_runs
)
DELETE FROM step_runs
USING ranked_steps
WHERE step_runs.id = ranked_steps.id AND ranked_steps.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS step_runs_run_step_uidx ON step_runs(run_id, step_id);
CREATE UNIQUE INDEX IF NOT EXISTS artifacts_run_path_uidx ON artifacts(run_id, path);
