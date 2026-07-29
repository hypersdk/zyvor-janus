#!/usr/bin/env bash
# Start the ForgeSim Next.js frontend (port 3000 by default).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=common.sh
source "$ROOT/scripts/common.sh"

WEB="$ROOT/web"
PORT="${PORT:-3000}"
export FORGESIM_API_URL="${FORGESIM_API_URL:-http://127.0.0.1:8080}"
# Next's dev/start server can't proxy WebSocket upgrades through rewrites (see
# web/src/lib/api.ts's runWebSocketUrl for details), so point the browser at the
# API directly for the live run view.
export NEXT_PUBLIC_FORGESIM_WS_URL="${NEXT_PUBLIC_FORGESIM_WS_URL:-ws://127.0.0.1:8080}"

if [[ -z "${FORGESIM_AUTH_CUSTOM:-}" ]]; then
  export FORGESIM_DASHBOARD_USER="Admin"
  export FORGESIM_DASHBOARD_PASSWORD="Admin@321"
else
  export FORGESIM_DASHBOARD_USER="${FORGESIM_DASHBOARD_USER:-Admin}"
  export FORGESIM_DASHBOARD_PASSWORD="${FORGESIM_DASHBOARD_PASSWORD:-Admin@321}"
fi

ensure_web_deps "$WEB"

echo "ForgeSim web UI → http://127.0.0.1:${PORT}"
echo "(proxies /api and /ws to http://127.0.0.1:8080 — start ./scripts/run_web_api.sh first)"
echo

cd "$WEB"
exec npm run dev -- -p "$PORT"
