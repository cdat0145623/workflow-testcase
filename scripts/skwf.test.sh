#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
test_root=$(mktemp -d)
trap 'rm -rf "$test_root"' EXIT
mkdir -p "$test_root/bin" "$test_root/elsewhere"

cat >"$test_root/bin/docker" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$SKWF_DOCKER_LOG"
if [[ "$*" == *" ps"* ]]; then printf 'stub ps\n'; fi
STUB
chmod +x "$test_root/bin/docker"

export PATH="$test_root/bin:$PATH"
export SKWF_DOCKER_LOG="$test_root/docker.log"

(cd "$test_root/elsewhere" && "$repo_root/scripts/skwf" status >/dev/null)
grep -F -- "compose -p sendkit-workflow -f $repo_root/infra/docker-compose.workflow.yml" "$SKWF_DOCKER_LOG" >/dev/null

(cd "$test_root/elsewhere" && "$repo_root/scripts/skwf" stop >/dev/null)
grep -F -- "stop workflow-web workflow-worker workflow-postgres" "$SKWF_DOCKER_LOG" >/dev/null

(cd "$test_root/elsewhere" && "$repo_root/scripts/skwf" acceptance >/dev/null)
grep -F -- "--profile web --profile ui-acceptance up --no-build --abort-on-container-exit --exit-code-from workflow-ui-acceptance workflow-postgres workflow-worker workflow-web workflow-ui-acceptance" "$SKWF_DOCKER_LOG" >/dev/null

(cd "$test_root/elsewhere" && "$repo_root/scripts/skwf" worker-acceptance >/dev/null)
grep -F -- "--profile acceptance up --no-build --abort-on-container-exit --exit-code-from workflow-acceptance workflow-postgres workflow-worker workflow-acceptance" "$SKWF_DOCKER_LOG" >/dev/null

if (cd "$test_root/elsewhere" && "$repo_root/scripts/skwf" unknown >/dev/null 2>&1); then
  echo "unknown command unexpectedly succeeded" >&2
  exit 1
fi

echo "skwf launcher tests passed"
