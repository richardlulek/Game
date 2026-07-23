#!/bin/bash
# SessionStart hook for Claude Code on the web.
#
# Solves two recurring problems when the container is (re)created:
#   1. node_modules is missing → tests/linters/build fail.
#   2. The fresh checkout lands on an OLD snapshot commit instead of the
#      tip of the working branch, so uncommitted or unpushed-but-committed
#      work appears "lost" and new work risks being built on a stale base.
#
# Both are repaired here, idempotently, so every session starts on the
# real tip of the branch with dependencies ready.
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

# ── Git sync (remote sessions only) ─────────────────────────────────
# Only touch git history in the remote (web) environment. Local dev
# sessions are never reset, so no working-tree changes are ever clobbered.
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)"
  if [ "$branch" != "HEAD" ] && git fetch origin "$branch" 2>/dev/null; then
    # Fast-forward ONLY when we are strictly behind origin (the container
    # came up on an old snapshot). If local has commits origin lacks, or
    # the branches diverged, leave history untouched so nothing is lost.
    if git merge-base --is-ancestor HEAD "origin/$branch" 2>/dev/null; then
      if [ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$branch")" ]; then
        echo "session-start: fast-forwarding $branch to origin/$branch"
        git reset --hard "origin/$branch"
      fi
    fi
  fi
fi

# ── Dependencies ────────────────────────────────────────────────────
# npm install (not ci) so the cached container layer is reused when the
# lockfile is unchanged; reinstall when node_modules is missing/stale.
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  echo "session-start: installing npm dependencies"
  npm install --no-audit --no-fund
else
  echo "session-start: node_modules present and up to date"
fi
