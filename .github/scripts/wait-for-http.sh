#!/usr/bin/env bash
#
# Polls a URL until it answers 200, then exits 0. Exits 1 with the
# container's logs if it never does, or if the container died first.
#
# Usage: wait-for-http.sh <url> <container-name> [timeout-seconds]
#
# nginx starts in well under a second, but the image renders its config from a
# template at start-up, so the poll covers that gap rather than guessing with a
# fixed sleep.

set -euo pipefail

url="$1"
container="$2"
timeout="${3:-30}"

for _ in $(seq "$timeout"); do
  if ! docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null | grep -q true; then
    echo "Container $container is not running."
    docker logs "$container" 2>&1 || true
    exit 1
  fi

  if curl -fsS -o /dev/null "$url"; then
    echo "$container is serving $url"
    exit 0
  fi

  sleep 1
done

echo "Timed out after ${timeout}s waiting for $url"
docker logs "$container" 2>&1 || true
exit 1
