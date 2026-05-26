#!/bin/sh
set -e

echo "[openclaw] Starting Python agent API on :8001..."
AGENT_API_PORT=8001 /venv/bin/python3 agents/agent_api.py &
PYTHON_PID=$!

# Wait for the API to be ready (uvicorn starts in ~1s)
sleep 3

# Verify it came up — non-fatal if it didn't (Node.js has the TypeScript fallback)
if ! kill -0 "$PYTHON_PID" 2>/dev/null; then
  echo "[openclaw] WARNING: Python agent API failed to start — ICT pipeline unavailable"
fi

echo "[openclaw] Starting Node.js market data server..."
exec node dist/server.js
