#!/usr/bin/env bash

# Function to clean up processes when script exits
cleanup() {
    echo "Stopping all processes..."
    kill $(jobs -p) 2>/dev/null
    exit 0
}

# Set trap for Ctrl+C (SIGINT)
trap cleanup SIGINT

echo "Starting client and server..."

# Start client dev script in the background
(cd client && ./dev.sh) &

# Start server dev script in the background
(cd server && ./dev.sh) &

echo "All processes started. Press Ctrl+C to stop."

# Wait for all background processes
wait