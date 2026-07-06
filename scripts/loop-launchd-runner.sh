#!/bin/zsh
set -u

PROJECT_DIR="/Users/maozhan/Documents/VB-世界杯观赛指南"
LOG_DIR="$PROJECT_DIR/.loop/logs"
mkdir -p "$LOG_DIR"

export PATH="/opt/local/bin:/Users/maozhan/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export LARK_CLI_BIN="/Users/maozhan/.npm-global/bin/lark-cli"

{
  echo "[$(date '+%Y-%m-%d %H:%M:%S %z')] launchd runner start"
  cd "$PROJECT_DIR" || exit 78
  /opt/local/bin/node scripts/loop-scheduler.mjs
  code=$?
  echo "[$(date '+%Y-%m-%d %H:%M:%S %z')] launchd runner exit $code"
  exit "$code"
} >> "$LOG_DIR/launchd.out.log" 2>> "$LOG_DIR/launchd.err.log"
