#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
SERVICE_NAME="${SERVICE_NAME:-todo}"

cd "$APP_DIR"
git fetch origin main
git reset --hard origin/main
npm ci --omit=dev
sudo systemctl restart "$SERVICE_NAME"
sudo systemctl --no-pager --full status "$SERVICE_NAME"
