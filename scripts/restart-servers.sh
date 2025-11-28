#!/bin/bash
# Restart both servers (stop + start)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🔄 Restarting Commander servers..."
echo ""

# Stop servers
bash "$SCRIPT_DIR/stop-servers.sh"

echo ""
echo "⏳ Waiting 2 seconds for ports to free up..."
sleep 2
echo ""

# Start servers
bash "$SCRIPT_DIR/start-servers.sh"
