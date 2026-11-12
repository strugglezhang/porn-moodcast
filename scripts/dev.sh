#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -d web/node_modules ]]; then
  echo "请先运行：cd web && npm ci"
  exit 1
fi
cargo build --locked
./target/debug/moodcast &
server_pid=$!
cleanup() {
  kill "$server_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
cd web
npm run dev
