#!/bin/bash
# deploy.sh - Kids Game Hub
# Usage:
#   ./deploy.sh               -> build + start
#   ./deploy.sh --down        -> stop and remove containers
#   ./deploy.sh --down --build -> stop, rebuild, and start
#   ./deploy.sh --logs        -> tail logs after starting
#   ./deploy.sh --no-cache    -> rebuild without cache

set -e

DOWN=false
BUILD=false
LOGS=false
NO_CACHE=false

for arg in "$@"; do
  case $arg in
    --down)     DOWN=true ;;
    --build)    BUILD=true ;;
    --logs)     LOGS=true ;;
    --no-cache) NO_CACHE=true ;;
  esac
done

# Read ports from .env (fallback to defaults)
FRONTEND_PORT=3000
BACKEND_PORT=8000
if [ -f ".env" ]; then
  while IFS='=' read -r key val; do
    case "$key" in
      FRONTEND_PORT) FRONTEND_PORT="$val" ;;
      BACKEND_PORT)  BACKEND_PORT="$val" ;;
    esac
  done < .env
fi

if $DOWN && ! $BUILD; then
  echo "🛑 Stopping containers..."
  docker compose down
  echo "✅ Done."
  exit 0
fi

if $DOWN && $BUILD; then
  echo "🛑 Stopping containers..."
  docker compose down
fi

echo "🔨 Building Docker images..."
if $NO_CACHE; then
  docker compose build --no-cache --progress=plain
else
  docker compose build --progress=plain
fi

echo "🚀 Starting services..."
docker compose up -d

echo ""
echo "✅ Running!"
echo "  Frontend -> http://localhost:$FRONTEND_PORT"
echo "  Backend  -> http://localhost:$BACKEND_PORT"
echo "  Health   -> http://localhost:$BACKEND_PORT/health"
echo ""

if $LOGS; then
  echo "📋 Tailing logs (Ctrl+C to stop)..."
  docker compose logs -f
fi