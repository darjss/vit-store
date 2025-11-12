#!/usr/bin/env fish

# Start the database container
echo "Starting database container..."
docker-compose up -d

# Wait a moment for the database to be ready
sleep 2

# Start bun dev in background
echo "Starting bun dev..."
bun dev &

# Run Caddy
echo "Starting Caddy..."
sudo caddy run

