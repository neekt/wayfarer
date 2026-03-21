#!/bin/bash
# ===============================
# FantasyMapper Launcher (Frontend Only)
# ===============================

# ------------------------------
# Configuration
# ------------------------------
FRONTEND_DIR="$HOME/wayfarer"
FRONTEND_PORT=8080

# ------------------------------
# Kill existing frontend process
# ------------------------------
echo "Checking for existing frontend server..."
if lsof -i :"$FRONTEND_PORT" &>/dev/null; then
    echo "Killing existing frontend on port $FRONTEND_PORT..."
    lsof -ti :"$FRONTEND_PORT" | xargs kill -9
fi

# ------------------------------
# Start frontend
# ------------------------------
cd "$FRONTEND_DIR" || { echo "Frontend folder not found"; exit 1; }
echo "Starting frontend on port $FRONTEND_PORT..."
python3 -m http.server "$FRONTEND_PORT" &
FRONTEND_PID=$!

# ------------------------------
# Wait for server
# ------------------------------
sleep 2

# ------------------------------
# Open browser
# ------------------------------
echo "Opening FantasyMapper in browser..."
if command -v xdg-open &>/dev/null; then
    xdg-open "http://localhost:$FRONTEND_PORT"
elif command -v open &>/dev/null; then
    open "http://localhost:$FRONTEND_PORT"
else
    echo "Please open http://localhost:$FRONTEND_PORT manually"
fi

# ------------------------------
# Display PID
# ------------------------------
echo "Frontend PID: $FRONTEND_PID"
echo "Press Ctrl+C to stop."

# ------------------------------
# Cleanup on exit
# ------------------------------
trap "echo 'Stopping frontend...'; kill $FRONTEND_PID; exit 0" SIGINT

# ------------------------------
# Wait
# ------------------------------
wait
