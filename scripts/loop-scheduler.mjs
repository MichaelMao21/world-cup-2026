import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const project = resolve(".");
const loopDir = resolve(project, ".loop");
const statePath = resolve(loopDir, "scheduler-state.json");
const config = await loadConfig();
const schedule = config.schedule || {};
const now = new Date();
const state = await loadState();
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

await mkdir(resolve(loopDir, "logs"), { recursive: true });

const matches = await loadMatches();
const dueEvents = findDueEvents(matches, now);

if (!dueEvents.length) {
  console.log(JSON.stringify({ ok: true, action: "skip", reason: "no due loop event", checkedAt: now.toISOString() }, null, 2));
  process.exit(0);
}

const trigger = dueEvents.map((event) => event.label).join("；");
const warnings = dueEvents.flatMap((event) => event.warnings);
const result = await runDailyLoop(trigger, warnings);

for (const event of dueEvents) {
  state.events[event.key] = {
    label: event.label,
    triggeredAt: now.toISOString(),
    status: result.status,
    exitCode: result.exitCode
  };
}
await writeFile(statePath, JSON.stringify(state, null, 2), "utf8");

const ok = result.exitCode === 0 || result.exitCode === 2;
console.log(JSON.stringify({ ok, action: "run", trigger, result }, null, 2));
process.exit(ok ? 0 : result.exitCode);

function findDueEvents(allMatches, currentTime) {
  const windowMinutes = schedule.matchTriggerWindowMinutes ?? 20;
  const catchUpLookbackMinutes = schedule.catchUpLookbackMinutes ?? 360;
  const halfOffset = schedule.halfTimeOffsetMinutes ?? 60;
  const fullOffset = schedule.fullTimeOffsetMinutes ?? 120;
  const events = [];
  const todayText = formatDateText(currentTime);
  const todayMatches = allMatches.filter((match) => match.dateText === todayText);

  for (const match of allMatches) {
    const kickoff = parseKickoff(match);
    if (!kickoff) continue;

    addMatchEvent({
      events,
      match,
      kind: "half",
      label: `半场巡检 ${match.homeTeam} vs ${match.awayTeam}`,
      target: addMinutes(kickoff, halfOffset),
      currentTime,
      windowMinutes,
      catchUpLookbackMinutes,
      warnings: buildHalfWarnings(match)
    });

    addMatchEvent({
      events,
      match,
      kind: "full",
      label: `完场巡检 ${match.homeTeam} vs ${match.awayTeam}`,
      target: addMinutes(kickoff, fullOffset),
      currentTime,
      windowMinutes,
      catchUpLookbackMinutes,
      warnings: buildFullWarnings(match)
    });
  }

  if (!todayMatches.length) {
    const dailyTarget = new Date(currentTime);
    dailyTarget.setHours(schedule.hour ?? 9, schedule.minute ?? 30, 0, 0);
    const key = `daily:${formatDateKey(currentTime)}`;
    if (isDue(currentTime, dailyTarget, windowMinutes) && !state.events[key]) {
      events.push({ key, label: "非比赛日每日巡检", warnings: [] });
    }
  }

  return events;
}

function addMatchEvent({ events, match, kind, label, target, currentTime, windowMinutes, catchUpLookbackMinutes, warnings }) {
  const key = `${kind}:${match.dateText}:${match.time}:${match.homeTeam}:${match.awayTeam}`;
  const dueMode = dueStatus(currentTime, target, windowMinutes, catchUpLookbackMinutes);
  if (!dueMode || state.events[key]) return;
  const catchUpWarnings = dueMode === "catch-up"
    ? [`补跑错过的${kind === "half" ? "半场" : "完场"}巡检: ${match.homeTeam} vs ${match.awayTeam}`]
    : [];
  events.push({ key, label, warnings: [...catchUpWarnings, ...warnings] });
}

function isDue(currentTime, target, windowMinutes) {
  const diffMs = currentTime.getTime() - target.getTime();
  return diffMs >= 0 && diffMs <= windowMinutes * 60 * 1000;
}

function dueStatus(currentTime, target, windowMinutes, catchUpLookbackMinutes) {
  const diffMs = currentTime.getTime() - target.getTime();
  if (diffMs < 0) return "";
  if (diffMs <= windowMinutes * 60 * 1000) return "on-time";
  if (diffMs <= catchUpLookbackMinutes * 60 * 1000) return "catch-up";
  return "";
}

async function runDailyLoop(trigger, warnings) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      "scripts/loop-daily.mjs",
      "--trigger",
      trigger
    ], {
      cwd: project,
      timeout: 180000,
      maxBuffer: 1024 * 1024 * 10,
      env: {
        ...process.env,
        LOOP_EXTRA_WARNINGS: JSON.stringify(warnings)
      }
    });
    return { status: "completed", exitCode: 0, stdout, stderr };
  } catch (error) {
    const exitCode = error.code ?? 1;
    return {
      status: exitCode === 2 ? "warning" : "failed",
      exitCode,
      stdout: error.stdout || "",
      stderr: error.stderr || error.message || ""
    };
  }
}

function buildHalfWarnings(match) {
  if (match.status === "scheduled" && !hasScore(match.homeScore) && !hasScore(match.awayScore)) {
    return [`半场巡检触发，但本地数据尚无比分: ${match.homeTeam} vs ${match.awayTeam}`];
  }
  return [];
}

function buildFullWarnings(match) {
  if (match.status !== "completed") {
    return [`完场巡检触发，但本地数据仍未标记完赛: ${match.homeTeam} vs ${match.awayTeam}`];
  }
  return [];
}

async function loadConfig() {
  const base = JSON.parse(await readFile(resolve(loopDir, "CONFIG.json"), "utf8"));
  try {
    const local = JSON.parse(await readFile(resolve(loopDir, "CONFIG.local.json"), "utf8"));
    return merge(base, local);
  } catch {
    return base;
  }
}

async function loadState() {
  try {
    const parsed = JSON.parse(await readFile(statePath, "utf8"));
    return { events: parsed.events || {} };
  } catch {
    return { events: {} };
  }
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

function hasScore(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateText(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("weekday")} ${get("day")} ${get("month")} ${get("year")}`;
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
