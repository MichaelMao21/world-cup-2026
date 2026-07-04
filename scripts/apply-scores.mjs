import { readFile, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";

const PROJECT = "/Users/maozhan/Documents/VB-世界杯观赛指南";
const log = (msg) => console.log(`[apply] ${msg}`);

const args = process.argv.slice(2);
const dateIdx = args.indexOf("--date");
const scoresIdx = args.indexOf("--scores");
const targetDate = dateIdx >= 0 ? args[dateIdx + 1] : null;
const scoresJson = scoresIdx >= 0 ? args[scoresIdx + 1] : null;

if (!targetDate || !scoresJson) {
  console.error('Usage: node scripts/apply-scores.mjs --date "Wednesday 24 June 2026" --scores \'[{"home":"Portugal","away":"Uzbekistan","homeScore":2,"awayScore":1}]\'');
  process.exit(1);
}

const scores = JSON.parse(scoresJson);
const data = JSON.parse(await readFile(`${PROJECT}/data/fifa-matches.json`, "utf8"));

let applied = 0;
for (const s of scores) {
  const match = data.matches.find(m =>
    m.dateText === targetDate && m.status !== "completed" &&
    m.homeTeam === s.home && m.awayTeam === s.away
  );
  if (match) {
    match.status = "completed";
    match.homeScore = s.homeScore;
    match.awayScore = s.awayScore;
    applied++;
    log(`Updated: ${match.homeTeam} ${match.homeScore}-${match.awayScore} ${match.awayTeam}`);
  }
}

const completed = data.matches.filter(m => m.status === "completed").length;
const scheduled = data.matches.filter(m => m.status === "scheduled").length;
data.counts.completed = completed;
data.counts.scheduled = scheduled;
data.importedAt = new Date().toISOString();

await writeFile(`${PROJECT}/data/fifa-matches.json`, JSON.stringify(data, null, 2));
log(`Applied ${applied} scores. Counts: ${completed} completed / ${scheduled} scheduled`);

const todayMatches = data.matches.filter(m => m.dateText === targetDate);
const stillPending = todayMatches.filter(m => m.status !== "completed");

if (stillPending.length > 0) {
  log(`NOT_READY: ${stillPending.length} still pending`);
  stillPending.forEach(m => log(`  ${m.homeTeam} vs ${m.awayTeam} (${m.time || "?"})`));
  process.exit(1);
}

log("Recalculating insights...");
execSync(`node scripts/calc-insights.mjs`, { cwd: PROJECT, timeout: 10000, stdio: "pipe" });

log("All matches done! Running full pipeline...");
execSync(`node scripts/build-prototype-data.mjs`, { cwd: PROJECT, timeout: 30000, stdio: "inherit" });
execSync(`node scripts/build-h5.mjs`, { cwd: PROJECT, timeout: 30000, stdio: "inherit" });

log("Publishing...");
try {
  execSync(`node scripts/push-cloudbase.mjs`, { cwd: PROJECT, timeout: 120000, stdio: "pipe" });
  log("✓ CloudBase");
} catch (e) { log("✗ CloudBase: " + e.message); }
try {
  execSync(`node scripts/push-github-pages.mjs`, { cwd: PROJECT, timeout: 60000, stdio: "pipe" });
  log("✓ GitHub Pages");
} catch (e) { log("✗ GitHub Pages: " + e.message); }

log("READY");
