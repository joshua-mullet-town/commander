#!/bin/bash
# Stop servers by reading their tracked PIDs

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_DIR="$PROJECT_ROOT/.pids"

echo "🛑 Stopping Commander servers..."

# Stop backend
if [ -f "$PID_DIR/backend.pid" ]; then
  BACKEND_PID=$(cat "$PID_DIR/backend.pid")
  if ps -p $BACKEND_PID > /dev/null 2>&1; then
    echo "🔪 Killing backend server (PID: $BACKEND_PID)..."
    kill $BACKEND_PID
    echo "✅ Backend stopped"
  else
    echo "⚠️  Backend PID $BACKEND_PID not running"
  fi
  rm "$PID_DIR/backend.pid"
else
  echo "⚠️  No backend PID file found"
fi

# Stop frontend
if [ -f "$PID_DIR/frontend.pid" ]; then
  FRONTEND_PID=$(cat "$PID_DIR/frontend.pid")
  if ps -p $FRONTEND_PID > /dev/null 2>&1; then
    echo "🔪 Killing frontend server (PID: $FRONTEND_PID)..."
    kill $FRONTEND_PID
    echo "✅ Frontend stopped"
  else
    echo "⚠️  Frontend PID $FRONTEND_PID not running"
  fi
  rm "$PID_DIR/frontend.pid"
else
  echo "⚠️  No frontend PID file found"
fi

# Cleanup PID directory if empty
if [ -d "$PID_DIR" ] && [ -z "$(ls -A $PID_DIR)" ]; then
  rmdir "$PID_DIR"
fi

echo "✅ All servers stopped"
