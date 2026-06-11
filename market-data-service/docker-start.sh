#!/bin/sh
set -e

echo "[openclaw] Starting Python agent API on :8001..."
AGENT_API_PORT=8001 /venv/bin/python3 agents/agent_api.py &
PYTHON_PID=$!

# Poll uvicorn until it responds — Railway cold-start can take 8-15s
echo "[openclaw] Waiting for Python API to be ready..."
RETRIES=30
i=0
while [ $i -lt $RETRIES ]; do
  if curl -sf http://127.0.0.1:8001/api/health >/dev/null 2>&1; then
    echo "[openclaw] Python API ready after ${i}s"
    break
  fi
  # Also check if the process died
  if ! kill -0 "$PYTHON_PID" 2>/dev/null; then
    echo "[openclaw] WARNING: Python agent API process died — ICT pipeline unavailable"
    break
  fi
  sleep 1
  i=$((i + 1))
done

if [ $i -eq $RETRIES ]; then
  echo "[openclaw] WARNING: Python API did not respond in ${RETRIES}s — proceeding anyway"
fi

echo "[openclaw] Starting Node.js market data server..."
exec node dist/server.js
