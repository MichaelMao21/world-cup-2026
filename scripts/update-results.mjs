import { execSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const PROJECT = "/Users/maozhan/Documents/VB-世界杯观赛指南";
const log = (msg) => console.log(`[update] ${new Date().toISOString().slice(0,19).replace('T',' ')} ${msg}`);

const args = process.argv.slice(2);
const dateIdx = args.indexOf("--date");
const targetDate = dateIdx >= 0 ? args[dateIdx + 1] : null;

if (!targetDate) {
  console.error("Usage: node scripts/update-results.mjs --date \"Wednesday 24 June 2026\"");
  process.exit(1);
}

const monthNames = { January:"01", February:"02", March:"03", April:"04", May:"05", June:"06",
  July:"07", August:"08", September:"09", October:"10", November:"11", December:"12" };
const weekMap = { Monday:"周一", Tuesday:"周二", Wednesday:"周三", Thursday:"周四",
  Friday:"周五", Saturday:"周六", Sunday:"周日" };

const currentMatches = JSON.parse(await readFile(`${PROJECT}/data/fifa-matches.json`, "utf8"));
const todayMatches = currentMatches.matches.filter(m => m.dateText === targetDate);
const todayCompleted = todayMatches.filter(m => m.status === "completed");
const todayScheduled = todayMatches.filter(m => m.status === "scheduled");

log(`Date: ${targetDate}`);
log(`Status: ${todayCompleted.length} completed, ${todayScheduled.length} scheduled, ${todayMatches.length} total`);

if (todayMatches.length === 0) {
  log("No matches on this date. Nothing to do.");
  process.exit(0);
}

if (todayCompleted.length === todayMatches.length) {
  log("All matches already completed. Nothing to do.");
  process.exit(0);
}

// List expected matches
log("Expected matches:");
todayMatches.forEach(m => {
  const status = m.status === "completed"
    ? `✅ ${m.homeTeam} ${m.homeScore}-${m.awayScore} ${m.awayTeam}`
    : `⏳ ${m.homeTeam} vs ${m.awayTeam} (${m.time || "?"}) [${m.group || m.stage}]`;
  log(`  ${status}`);
});

// --- Step 1: Try Chrome extraction ---
log("Step 1: Extracting from Chrome...");
let chromeOk = false;
try {
  const extract = execSync(
    `osascript -l JavaScript scripts/extract-active-chrome-page.js`,
    { cwd: PROJECT, timeout: 120000, encoding: "utf8" }
  );
  const result = JSON.parse(extract);
  if (result.written && result.matchCount >= 90) {
    chromeOk = true;
    log(`  ✓ Chrome returned ${result.matchCount} match cards`);
  } else {
    log(`  ⚠ Only ${result.matchCount || 0} cards, insufficient`);
  }
} catch (e) {
  log(`  ✗ Chrome unavailable: ${e.message}`);
}

// --- Step 2: If Chrome OK, normalize and check ---
if (chromeOk) {
  log("Step 2: Normalizing Chrome data...");
  execSync(`node scripts/normalize-fifa-matches.mjs`, { cwd: PROJECT, timeout: 30000, stdio: "pipe" });

  const refreshed = JSON.parse(await readFile(`${PROJECT}/data/fifa-matches.json`, "utf8"));
  const refreshedToday = refreshed.matches.filter(m => m.dateText === targetDate);
  const stillPending = refreshedToday.filter(m => m.status !== "completed");

  if (stillPending.length === 0) {
    log("✓ All matches completed via Chrome! Running full pipeline...");
    await fullPipeline();
    process.exit(0);
  }
  log(`${stillPending.length} matches still pending after Chrome extraction`);
}

// --- Step 3: Chrome didn't help → output WebSearch fallback instruction ---
const pendingMatches = todayMatches.filter(m => m.status !== "completed");
const teams = new Set();
pendingMatches.forEach(m => { teams.add(m.homeTeam); teams.add(m.awayTeam); });

const dateParts = targetDate.split(" ");
const weekday = dateParts[0], day = dateParts[1], month = dateParts[2], year = dateParts[3];
const beijingDateStr = `${year}年${monthNames[month] || month}月${day.padStart(2,'0')}日 ${weekMap[weekday] || weekday}`;

const ctx = {
  action: "web_search",
  targetDate,
  matchDateChinese: beijingDateStr,
  pendingCount: pendingMatches.length,
  completedCount: todayCompleted.length,
  totalCount: todayMatches.length,
  matches: pendingMatches.map(m => ({
    id: m.id,
    time: m.time || "待定",
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    group: m.group || "",
    stage: m.stage,
  })),
  teamsToSearch: [...teams].join(", "),
  hints: {
    searchQueryEn: `${year} World Cup ${targetDate} ${[...teams].join(" ")} scores results`,
    searchQueryZh: `2026世界杯 ${beijingDateStr} ${[...teams].slice(0,4).join(" ")} 比分`,
  }
};

console.log(JSON.stringify(ctx, null, 2));
process.exit(2);
// Exit 2 means: Chrome unavailable, use WebSearch to fill in scores.
// The agent should:
//   1. WebSearch(ctx.hints.searchQueryEn) and WebSearch(ctx.hints.searchQueryZh)
//   2. Find scores for each match in ctx.matches
//   3. node scripts/apply-scores.mjs --date "<targetDate>" --scores '<json>'
//   4. If all scores found: run full pipeline
//   5. If NOT_READY (not all matches finished): ScheduleWakeup(300s) retry

async function fullPipeline() {
  execSync(`node scripts/calc-insights.mjs`, { cwd: PROJECT, timeout: 10000, stdio: "pipe" });
  execSync(`node scripts/build-prototype-data.mjs`, { cwd: PROJECT, timeout: 30000, stdio: "inherit" });
  execSync(`node scripts/build-h5.mjs`, { cwd: PROJECT, timeout: 30000, stdio: "inherit" });
  log("Publishing...");
  try {
    execSync(`node scripts/push-cloudbase.mjs`,
      { cwd: PROJECT, timeout: 60000, stdio: "pipe" });
    log("  ✓ CloudBase");
  } catch (e) { log("  ✗ CloudBase: " + e.message); }
  try {
    execSync(`node scripts/push-github-pages.mjs`, { cwd: PROJECT, timeout: 60000, stdio: "pipe" });
    log("  ✓ GitHub Pages");
  } catch (e) { log("  ✗ GitHub Pages: " + e.message); }
  const final = JSON.parse(await readFile(`${PROJECT}/data/fifa-matches.json`, "utf8"));
  log(`Done. ${final.counts.completed} completed / ${final.counts.scheduled} scheduled`);
}
