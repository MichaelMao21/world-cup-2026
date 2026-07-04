import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const PROJECT = "/Users/maozhan/Documents/VB-世界杯观赛指南";
const log = (msg) => console.log(`[check] ${new Date().toISOString().slice(0,19).replace('T',' ')} ${msg}`);

// Parse args: node check-and-update.mjs --date "Tuesday 23 June 2026"
const args = process.argv.slice(2);
const dateArg = args.indexOf("--date");
const targetDate = dateArg >= 0 ? args[dateArg + 1] : null;

if (!targetDate) {
  console.error("Usage: node check-and-update.mjs --date \"Tuesday 23 June 2026\"");
  process.exit(1);
}

// Read current data to know what's expected
const currentMatches = JSON.parse(await readFile(`${PROJECT}/data/fifa-matches.json`, "utf8"));
const todayScheduled = currentMatches.matches.filter(m => m.dateText === targetDate && m.status === "scheduled");

if (todayScheduled.length === 0) {
  // Check if already completed
  const todayCompleted = currentMatches.matches.filter(m => m.dateText === targetDate && m.status === "completed");
  log(`No scheduled matches for ${targetDate}. Already completed: ${todayCompleted.length}. Nothing to do.`);
  process.exit(0);
}

log(`Expecting ${todayScheduled.length} matches to finish on ${targetDate}:`);
todayScheduled.forEach(m => log(`  ${m.time || '?'} | ${m.homeTeam} vs ${m.awayTeam} | ${m.group || m.stage}`));

// --- Step 1: Extract from Chrome ---
log("Extracting from Chrome...");
let extractedCount = 0;
try {
  const extract = execSync(
    `osascript -l JavaScript scripts/extract-active-chrome-page.js`,
    { cwd: PROJECT, timeout: 120000, encoding: "utf8" }
  );
  const result = JSON.parse(extract);
  extractedCount = result.matchCount || 0;
  log(`  Chrome returned ${extractedCount} match cards`);
} catch (e) {
  log(`  Chrome extraction failed: ${e.message}`);
  process.exit(2); // exit code 2 = extraction error, retry
}

// --- Step 2: Check if today's matches have results ---
log("Normalizing to check for results...");
execSync(`node scripts/normalize-fifa-matches.mjs`, { cwd: PROJECT, timeout: 30000, stdio: "pipe" });

const updatedMatches = JSON.parse(await readFile(`${PROJECT}/data/fifa-matches.json`, "utf8"));
const todayUpdated = updatedMatches.matches.filter(m => m.dateText === targetDate);

const stillScheduled = todayUpdated.filter(m => m.status === "scheduled");
const nowCompleted = todayUpdated.filter(m => m.status === "completed");

log(`Status: ${nowCompleted.length}/${todayUpdated.length} completed, ${stillScheduled.length} still scheduled`);

if (stillScheduled.length > 0) {
  log("Matches still pending:");
  stillScheduled.forEach(m => log(`  ${m.time || '?'} | ${m.homeTeam} vs ${m.awayTeam}`));
  log("NOT_READY"); // signal for agent to read
  process.exit(1); // exit 1 = not ready yet, agent should retry
}

// --- Step 3: All done, full update ---
log("All matches completed! Running full update pipeline...");

execSync(`node scripts/build-prototype-data.mjs`, { cwd: PROJECT, timeout: 30000, stdio: "inherit" });
execSync(`node scripts/build-h5.mjs`, { cwd: PROJECT, timeout: 30000, stdio: "inherit" });
log("Publishing to Miaoda + GitHub Pages...");
try {
  execSync(`lark-cli apps +html-publish --app-id app_4kem9q6px8by3 --path ./dist --as user`,
    { cwd: PROJECT, timeout: 60000, stdio: "pipe" });
  log("  ✓ Miaoda published");
} catch (e) { log("  ✗ Miaoda publish failed: " + e.message); }
try {
  execSync(`node scripts/push-github-pages.mjs`, { cwd: PROJECT, timeout: 60000, stdio: "pipe" });
  log("  ✓ GitHub Pages published");
} catch (e) { log("  ✗ GitHub Pages publish failed: " + e.message); }

log("READY"); // signal for agent
log(`Updated: ${nowCompleted.length} matches completed for ${targetDate}`);
nowCompleted.forEach(m => {
  log(`  ${m.homeTeam} ${m.homeScore}-${m.awayScore} ${m.awayTeam}`);
});
