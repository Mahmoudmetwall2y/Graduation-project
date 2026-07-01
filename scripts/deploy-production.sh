#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${ASCULTICOR_APP_DIR:-/opt/asculticor}"
BRANCH="${ASCULTICOR_DEPLOY_BRANCH:-main}"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.cloud.yml)

cd "$APP_DIR"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing deployment: $APP_DIR has uncommitted changes." >&2
  exit 1
fi

previous_revision="$(git rev-parse HEAD)"
git fetch --prune origin "$BRANCH"
git switch "$BRANCH"
git merge --ff-only "origin/$BRANCH"
target_revision="$(git rev-parse HEAD)"

wait_for_health() {
  local attempt
  for attempt in $(seq 1 36); do
    if curl --fail --silent --show-error http://127.0.0.1:3000/api/health >/dev/null \
      && curl --fail --silent --show-error http://127.0.0.1:8000/health >/dev/null; then
      return 0
    fi
    sleep 5
  done
  return 1
}

deploy_current_checkout() {
  "${COMPOSE[@]}" config --quiet
  "${COMPOSE[@]}" build
  "${COMPOSE[@]}" up -d --remove-orphans
  wait_for_health
}

if deploy_current_checkout; then
  echo "AscultiCor deployed successfully: $target_revision"
  exit 0
fi

echo "Deployment health checks failed; rolling back to $previous_revision" >&2
git switch --detach "$previous_revision"
deploy_current_checkout
git switch "$BRANCH"
echo "Rollback completed. Running revision: $previous_revision" >&2
exit 1
