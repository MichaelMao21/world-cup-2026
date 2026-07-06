import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const project = resolve(".");
const config = JSON.parse(await readFile(resolve(project, ".loop/CONFIG.json"), "utf8"));
const localConfig = await readLocalConfig();
const merged = merge(config, localConfig);
const schedule = merged.schedule || {};
const catchUpIntervalSeconds = Math.max(60, Math.round((schedule.catchUpIntervalMinutes ?? 30) * 60));
const label = "com.maozhan.world-cup-guide.loop-daily";
const launchAgentsDir = resolve(homedir(), "Library/LaunchAgents");
const supportDir = resolve(homedir(), ".world-cup-guide-loop");
const plistPath = resolve(launchAgentsDir, `${label}.plist`);
const runnerPath = resolve(supportDir, "loop-launchd-runner.sh");
const now = new Date();
const monthNames = {
  January: 1,
  February: 2,
  March: 3,
  April: 4,
  May: 5,
  June: 6,
  July: 7,
  August: 8,
  September: 9,
  October: 10,
  November: 11,
  December: 12
};
const intervals = await buildCalendarIntervals(now);

await mkdir(launchAgentsDir, { recursive: true });
await mkdir(supportDir, { recursive: true });
await writeFile(runnerPath, runnerScript(project), { mode: 0o755 });
await chmod(runnerPath, 0o755);

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${runnerPath}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${project}</string>
  <key>StartCalendarInterval</key>
${renderCalendarIntervals(intervals)}
  <key>StartInterval</key>
  <integer>${catchUpIntervalSeconds}</integer>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/local/bin:/Users/maozhan/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>LARK_CLI_BIN</key>
    <string>/Users/maozhan/.npm-global/bin/lark-cli</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${resolve(project, ".loop/logs/launchd.out.log")}</string>
  <key>StandardErrorPath</key>
  <string>${resolve(project, ".loop/logs/launchd.err.log")}</string>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
`;

await mkdir(resolve(project, ".loop/logs"), { recursive: true });
await writeFile(plistPath, plist, "utf8");

await unloadIfLoaded(label);
await execFileAsync("launchctl", ["load", plistPath]);

console.log(JSON.stringify({
  ok: true,
  label,
  plistPath,
  schedule: "event-driven",
  catchUpIntervalMinutes: Math.round(catchUpIntervalSeconds / 60),
  triggerCount: intervals.length,
  nextTriggers: intervals.slice(0, 8).map((item) => item.description)
}, null, 2));

async function unloadIfLoaded(serviceLabel) {
  try {
    await execFileAsync("launchctl", ["unload", plistPath]);
  } catch {
    // Not loaded yet.
  }
}

async function readLocalConfig() {
  try {
    return JSON.parse(await readFile(resolve(project, ".loop/CONFIG.local.json"), "utf8"));
  } catch {
    return {};
  }
}

function merge(base, override) {
  const output = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    output[key] = value && typeof value === "object" && !Array.isArray(value)
      ? merge(base[key] || {}, value)
      : value;
  }
  return output;
}

async function buildCalendarIntervals(currentTime) {
  const matches = await loadMatches();
  const halfOffset = schedule.halfTimeOffsetMinutes ?? 60;
  const fullOffset = schedule.fullTimeOffsetMinutes ?? 120;
  const dailyHour = schedule.hour ?? 9;
  const dailyMinute = schedule.minute ?? 30;
  const entries = new Map();

  addEntry(entries, {
    month: "*",
    day: "*",
    hour: dailyHour,
    minute: dailyMinute,
    description: `daily ${String(dailyHour).padStart(2, "0")}:${String(dailyMinute).padStart(2, "0")}`
  });

  for (const match of matches) {
    const kickoff = parseKickoff(match);
    if (!kickoff) continue;

    const half = addMinutes(kickoff, halfOffset);
    const full = addMinutes(kickoff, fullOffset);
    if (half > currentTime) {
      addEntry(entries, calendarEntry(half, `half ${match.homeTeam} vs ${match.awayTeam}`));
    }
    if (full > currentTime) {
      addEntry(entries, calendarEntry(full, `full ${match.homeTeam} vs ${match.awayTeam}`));
    }
  }

  return [...entries.values()].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

function addEntry(entries, entry) {
  const key = `${entry.month}:${entry.day}:${entry.hour}:${entry.minute}`;
  if (entries.has(key)) {
    const existing = entries.get(key);
    existing.description = `${existing.description}; ${entry.description}`;
    return;
  }
  entries.set(key, entry);
}

function calendarEntry(date, description) {
  return {
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    description: `${formatDate(date)} ${description}`
  };
}

function renderCalendarIntervals(items) {
  const dicts = items.map((item) => {
    const month = item.month === "*" ? "" : `    <key>Month</key>\n    <integer>${item.month}</integer>\n`;
    const day = item.day === "*" ? "" : `    <key>Day</key>\n    <integer>${item.day}</integer>\n`;
    return `  <dict>\n${month}${day}    <key>Hour</key>\n    <integer>${item.hour}</integer>\n    <key>Minute</key>\n    <integer>${item.minute}</integer>\n  </dict>`;
  }).join("\n");
  return `  <array>\n${dicts}\n  </array>`;
}

async function loadMatches() {
  const data = JSON.parse(await readFile(resolve(project, "data/fifa-matches.json"), "utf8"));
  return Array.isArray(data.matches) ? data.matches : [];
}

function parseKickoff(match) {
  if (!match.dateText || !match.time) return null;
  const parts = match.dateText.split(/\s+/);
  const day = Number(parts[1]);
  const month = monthNames[parts[2]];
  const year = Number(parts[3]);
  const [hour, minute] = String(match.time).split(":").map(Number);
  if (!year || !month || !day || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function sortKey(item) {
  const month = item.month === "*" ? "99" : String(item.month).padStart(2, "0");
  const day = item.day === "*" ? "99" : String(item.day).padStart(2, "0");
  return `${month}-${day}-${String(item.hour).padStart(2, "0")}-${String(item.minute).padStart(2, "0")}`;
}

function formatDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function runnerScript(projectDir) {
  return `#!/bin/zsh
set -u

PROJECT_DIR=${JSON.stringify(projectDir)}
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
`;
}
