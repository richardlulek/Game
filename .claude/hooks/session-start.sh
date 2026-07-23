#!/bin/bash
# SessionStart hook for Claude Code on the web.
#
# Solves the recurring problems when the container is (re)created:
#   1. node_modules is missing → tests/linters/build fail.
#   2. A fresh container lands on an OLD snapshot commit — sometimes with
#      stale uncommitted working-tree changes on top — instead of the tip of
#      the working branch, so work appears "lost" and new work risks being
#      built on a stale base.
#
# Hardening notes (learned the hard way):
#   · The git sync runs ONLY on source=startup (a fresh container). On
#     resume/clear/compact the session already has live, possibly
#     uncommitted work — never hard-reset that.
#   · The fetch is retried: this environment's network is flaky, and a
#     failed fetch used to leave the origin ref stale so the sync silently
#     no-op'd.
#   · When behind OR level with origin we hard-reset to the tip. That both
#     advances a stale snapshot AND clears stale uncommitted junk the
#     snapshot left behind. Safe at startup: no session work exists yet.
set -euo pipefail

# SessionStart delivers a JSON payload on stdin ({"source":"startup",...}).
INPUT="$(cat 2>/dev/null || true)"
source_val="$(printf '%s' "$INPUT" | grep -o '"source"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)".*/\1/')"
source_val="${source_val:-startup}"

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

# ── Git sync (remote sessions, fresh startup only) ──────────────────
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] && [ "$source_val" = "startup" ]; then
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)"
  if [ "$branch" != "HEAD" ]; then
    fetched=0
    for i in 1 2 3 4; do
      if git fetch origin "$branch" 2>/dev/null; then fetched=1; break; fi
      sleep $((i * 2))
    done
    if [ "$fetched" = "1" ] && git merge-base --is-ancestor HEAD "origin/$branch" 2>/dev/null; then
      # Behind or level with origin → hard-reset to the tip (advances a stale
      # snapshot and wipes stale working-tree changes it carried).
      echo "session-start: syncing $branch to origin/$branch (startup)"
      git reset --hard "origin/$branch"
    else
      echo "session-start: history left untouched (ahead/diverged, or fetch failed)"
    fi
  fi
else
  echo "session-start: git sync skipped (source=$source_val, remote=${CLAUDE_CODE_REMOTE:-unset})"
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
