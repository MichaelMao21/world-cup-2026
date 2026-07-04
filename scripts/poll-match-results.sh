#!/bin/bash
# 赛果轮询脚本 — 不依赖 Claude Code，可独立运行
# 用法: bash scripts/poll-match-results.sh "Thursday 25 June 2026"
# 逻辑: 在目标日赛后每5分钟检查一次 FIFA 官网，直到全部更新或超时

set -e

TARGET_DATE="$1"
MATCH_WINDOW_MIN="${2:-150}"   # 默认轮询 150 分钟（2.5小时）
POLL_INTERVAL="${3:-300}"      # 默认每 5 分钟检查一次

if [ -z "$TARGET_DATE" ]; then
  echo "Usage: bash poll-match-results.sh \"Thursday 25 June 2026\" [max_wait_minutes] [poll_interval_seconds]"
  exit 1
fi

PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
LOG() { echo "[poll $(date '+%H:%M:%S')] $*"; }

LOG "Starting poll for: $TARGET_DATE"
LOG "Max wait: ${MATCH_WINDOW_MIN}min, Interval: ${POLL_INTERVAL}s"

cd "$PROJECT"

# Count how many tries
MAX_TRIES=$(( MATCH_WINDOW_MIN * 60 / POLL_INTERVAL ))
LOG "Max attempts: $MAX_TRIES"

for ((i=1; i<=MAX_TRIES; i++)); do
  LOG "Attempt $i/$MAX_TRIES..."

  # Try Chrome extraction first
  CHROME_OK=false
  if osascript -l JavaScript scripts/extract-active-chrome-page.js 2>/dev/null; then
    CHROME_OK=true
  fi

  if $CHROME_OK; then
    LOG "Chrome extraction OK, normalizing..."
    node scripts/normalize-fifa-matches.mjs 2>/dev/null
  else
    LOG "Chrome not available (will retry)"
    sleep $POLL_INTERVAL
    continue
  fi

  # Check if all matches for this date are done
  PENDING=$(node -e "
    const d = JSON.parse(require('fs').readFileSync('data/fifa-matches.json','utf8'));
    const pending = d.matches.filter(m => m.dateText === '$TARGET_DATE' && m.status !== 'completed');
    if(pending.length) { pending.forEach(m => console.log('⏳ ' + m.homeTeam + ' vs ' + m.awayTeam)); }
    console.log(pending.length);
  " 2>/dev/null)

  PENDING_COUNT=$(echo "$PENDING" | tail -1)

  if [ "$PENDING_COUNT" = "0" ]; then
    LOG "✅ All matches completed!"
    node scripts/calc-insights.mjs
    node scripts/build-prototype-data.mjs
    node scripts/build-h5.mjs
    node scripts/push-cloudbase.mjs 2>/dev/null || true
    node scripts/push-github-pages.mjs 2>/dev/null || true
    lark-cli apps +html-publish --app-id app_4kem9q6px8by3 --path ./dist --as user 2>/dev/null || true
    LOG "Published to CloudBase + GitHub Pages + Miaoda"
    # Show results
    node -e "
      const d = JSON.parse(require('fs').readFileSync('data/fifa-matches.json','utf8'));
      const today = d.matches.filter(m => m.dateText === '$TARGET_DATE');
      console.log('\\n=== ' + '$TARGET_DATE' + ' 赛果 ===');
      today.forEach(m => console.log(m.homeTeam + ' ' + m.homeScore + '-' + m.awayScore + ' ' + m.awayTeam));
      console.log('Total: ' + d.counts.completed + ' completed / ' + d.counts.scheduled + ' scheduled');
    "
    exit 0
  fi

  echo "$PENDING" | head -1 | while read line; do LOG "$line"; done
  LOG "Still waiting for results... sleeping ${POLL_INTERVAL}s"
  sleep $POLL_INTERVAL
done

LOG "⚠️ Max attempts reached. Some matches may not be updated yet."
LOG "To retry: bash scripts/poll-match-results.sh \"$TARGET_DATE\""
exit 1
