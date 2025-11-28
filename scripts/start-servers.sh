#!/bin/bash
# Start both frontend and backend servers, tracking their PIDs

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_DIR="$PROJECT_ROOT/.pids"

# Create PID directory if it doesn't exist
mkdir -p "$PID_DIR"

echo "🚀 Starting Commander servers..."

# Start backend server
cd "$PROJECT_ROOT/server"
echo "📡 Starting backend server (port 9999)..."
npm run dev > "$PROJECT_ROOT/.backend.log" 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > "$PID_DIR/backend.pid"
echo "✅ Backend started with PID: $BACKEND_PID"

# Start frontend server
cd "$PROJECT_ROOT/frontend"
echo "🎨 Starting frontend server (port 3456)..."
npm run dev > "$PROJECT_ROOT/.frontend.log" 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > "$PID_DIR/frontend.pid"
echo "✅ Frontend started with PID: $FRONTEND_PID"

echo ""
echo "🎮 Servers running:"
echo "   Backend:  http://localhost:9999 (PID: $BACKEND_PID)"
echo "   Frontend: http://localhost:3456 (PID: $FRONTEND_PID)"
echo ""
echo "📝 Logs:"
echo "   Backend:  tail -f $PROJECT_ROOT/.backend.log"
echo "   Frontend: tail -f $PROJECT_ROOT/.frontend.log"
echo ""
echo "🛑 To stop: npm run stop"
