#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/home/opc/todo}"
SERVICE_NAME="${SERVICE_NAME:-free-adhd-memo}"
NODE_BIN="$(command -v node)"
NPM_BIN="$(command -v npm)"

sudo install -m 0644 systemd/free-adhd-memo.service "/etc/systemd/system/${SERVICE_NAME}.service"
sudo sed -i "s|/home/opc/todo|${APP_DIR}|g" "/etc/systemd/system/${SERVICE_NAME}.service"
sudo sed -i "s|/usr/bin/node|${NODE_BIN}|g" "/etc/systemd/system/${SERVICE_NAME}.service"
sudo sed -i "s|/usr/bin/npm|${NPM_BIN}|g" "/etc/systemd/system/${SERVICE_NAME}.service"
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"
sudo systemctl --no-pager --full status "$SERVICE_NAME"
