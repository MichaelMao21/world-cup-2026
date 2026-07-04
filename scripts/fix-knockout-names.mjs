import { readFile, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";

const PROJECT = "/Users/maozhan/Documents/VB-世界杯观赛指南";
const log = (msg) => console.log(`[fix] ${msg}`);

const data = JSON.parse(await readFile(`${PROJECT}/data/fifa-matches.json`, "utf8"));

// ── Step 1: Fix wrong group stage scores ──
const fixes = [
  // Egypt vs Iran: was 1-2, actual 1-1 (Egypt runner-up, not 3rd)
  { home: "Egypt", away: "IR Iran", correctHome: 1, correctAway: 1 },
  // Congo DR vs Uzbekistan: was 0-1, actual 3-1 (Congo DR qualified as 3rd)
  { home: "Congo DR", away: "Uzbekistan", correctHome: 3, correctAway: 1 },
];

for (const f of fixes) {
  const m = data.matches.find(x => x.homeTeam === f.home && x.awayTeam === f.away && x.stage === "First Stage");
  if (m) {
    log(`Fix score: ${m.homeTeam} ${m.homeScore}-${m.awayScore} ${m.awayTeam} → ${f.correctHome}-${f.correctAway}`);
    m.homeScore = f.correctHome;
    m.awayScore = f.correctAway;
  } else {
    log(`WARN: match not found: ${f.home} vs ${f.away}`);
  }
}

// ── Step 2: Replace knockout placeholder team names ──
// Group winners
const winners = {
  "1A": "Mexico", "1B": "Switzerland", "1C": "Brazil", "1D": "USA",
  "1E": "Germany", "1F": "Netherlands", "1G": "Belgium", "1H": "Spain",
  "1I": "France", "1J": "Argentina", "1K": "Colombia", "1L": "England",
};
// Group runners-up
const runnersUp = {
  "2A": "South Africa", "2B": "Canada", "2C": "Morocco", "2D": "Australia",
  "2E": "Côte d'Ivoire", "2F": "Japan", "2G": "Egypt", "2H": "Cabo Verde",
  "2I": "Norway", "2J": "Austria", "2K": "Portugal", "2L": "Croatia",
};
// 3rd-place representatives (confirmed from actual R32 matchups)
const thirdPlace = {
  "3ABCDF": "Paraguay",
  "3CDFGH": "Sweden",
  "3CEFHI": "Ecuador",
  "3EHIJK": "Congo DR",
  "3AEHIJ": "Senegal",
  "3BEFIJ": "Bosnia and Herzegovina",
  "3EFGIJ": "Algeria",
  "3DEIJL": "Ghana",
};
// Round of 16 winner codes → actual teams (for confirmed R32 results)
// R32 match numbers 73-88 map to the 16 knockout matches in order
const r16Winners = {
  "W73": "Canada",     // South Africa 0-1 Canada
  "W74": "Brazil",     // Brazil 2-1 Japan
  "W75": "Paraguay",   // Germany 1-1 Paraguay (Paraguay on PKs)
  "W76": "Morocco",    // Netherlands 1-1 Morocco (Morocco on PKs)
  "W77": "Norway",     // Ivory Coast 1-2 Norway
  "W78": "France",     // France 3-0 Sweden
  "W79": "Mexico",     // Mexico 2-0 Ecuador
  "W80": "England",    // England 2-1 Congo DR
  "W81": "Belgium",    // Belgium 3-2 Senegal
  "W82": "USA",        // USA 2-0 Bosnia
  "W83": "Spain",      // Spain 3-0 Austria
  "W84": "Portugal",   // Portugal 2-1 Croatia
  "W85": "Switzerland",// Switzerland 2-0 Algeria
  // W86, W87, W88: still TBD (today's matches)
};

const nameMap = { ...winners, ...runnersUp, ...thirdPlace, ...r16Winners };

let replaced = 0;
for (const m of data.matches) {
  if (m.stage === "First Stage") continue; // skip group stage
  const origHome = m.homeTeam;
  const origAway = m.awayTeam;
  if (nameMap[m.homeTeam]) { m.homeTeam = nameMap[m.homeTeam]; }
  if (nameMap[m.awayTeam]) { m.awayTeam = nameMap[m.awayTeam]; }
  if (m.homeTeam !== origHome || m.awayTeam !== origAway) {
    log(`${origHome} vs ${origAway} → ${m.homeTeam} vs ${m.awayTeam}`);
    replaced++;
  }
}

log(`Replaced ${replaced} team name placeholders`);

// Recalculate counts
const completed = data.matches.filter(m => m.status === "completed").length;
const scheduled = data.matches.filter(m => m.status === "scheduled").length;
data.counts.completed = completed;
data.counts.scheduled = scheduled;
data.importedAt = new Date().toISOString();

await writeFile(`${PROJECT}/data/fifa-matches.json`, JSON.stringify(data, null, 2));
log(`Saved. ${completed} completed / ${scheduled} scheduled`);

// ── Step 3: Rebuild pipeline ──
log("Recalculating insights...");
execSync(`node scripts/calc-insights.mjs`, { cwd: PROJECT, stdio: "inherit" });
log("Building data...");
execSync(`node scripts/build-prototype-data.mjs`, { cwd: PROJECT, stdio: "inherit" });
execSync(`node scripts/build-h5.mjs`, { cwd: PROJECT, stdio: "inherit" });

log("Publishing...");
try { execSync(`node scripts/push-cloudbase.mjs`, { cwd: PROJECT, timeout: 120000, stdio: "pipe" }); log("✓ CloudBase"); }
catch (e) { log("✗ CloudBase: " + e.message.split("\n")[0]); }
try { execSync(`node scripts/push-github-pages.mjs`, { cwd: PROJECT, timeout: 60000, stdio: "pipe" }); log("✓ GitHub Pages"); }
catch (e) { log("✗ GitHub Pages: " + e.message.split("\n")[0]); }

log("DONE");
