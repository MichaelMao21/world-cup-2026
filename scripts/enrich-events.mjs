/**
 * enrich-events.mjs
 *
 * Fetches match event data from ESPN API for completed matches that are missing
 * event fields (halfFirstGoalTeam, yellowCards, redCards, homeHalfScore, awayHalfScore).
 *
 * Usage:
 *   node scripts/enrich-events.mjs                  # all incomplete matches
 *   node scripts/enrich-events.mjs --date "Saturday 04 July 2026"
 *   node scripts/enrich-events.mjs --dry-run        # preview without saving
 */

import { readFile, writeFile } from "node:fs/promises";

const PROJECT = "/Users/maozhan/Documents/VB-世界杯观赛指南";
const MATCHES_PATH = `${PROJECT}/data/fifa-matches.json`;
const ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const ESPN_SUMMARY   = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary";

const args = process.argv.slice(2);
const targetDate = args[args.indexOf("--date") + 1] || null;
const dryRun = args.includes("--dry-run");

const data = JSON.parse(await readFile(MATCHES_PATH, "utf8"));

// Normalise team name for fuzzy matching against ESPN names
function norm(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace("caboverde", "capeverde")
    .replace("côtedivoire", "ivorycoast")
    .replace("cotedivoire", "ivorycoast")
    .replace("korearepublic", "southkorea")
    .replace("türkiye", "turkey")
    .replace("usmnt", "usa")
    .replace("unitedstates", "usa")
    .replace("bosniaandherzegovina", "bosnia")
    .replace("bosniaherzegovina", "bosnia")
    .replace("democraticrepublicofthecongo", "congodrc")
    .replace("congodr", "congodrc");
}

function teamsMatch(espnHome, espnAway, ourHome, ourAway) {
  const eh = norm(espnHome), ea = norm(espnAway);
  const oh = norm(ourHome), oa = norm(ourAway);
  return (eh === oh && ea === oa) || (eh === oa && ea === oh);
}

function dateToEspn(dateText) {
  // "Saturday 04 July 2026" → "20260704"
  const months = { January:"01",February:"02",March:"03",April:"04",May:"05",June:"06",
                   July:"07",August:"08",September:"09",October:"10",November:"11",December:"12" };
  const parts = dateText.trim().split(/\s+/);
  const day = parts[1].padStart(2, "0");
  const month = months[parts[2]];
  const year = parts[3];
  if (!month) return null;
  return `${year}${month}${day}`;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "user-agent": "WorldCupWatchGuide/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function getEspnIdForMatch(match) {
  const yyyymmdd = dateToEspn(match.dateText);
  if (!yyyymmdd) return null;

  // Our dates are Beijing time (+8); ESPN uses ET (-4), so ESPN date is typically 1 day behind ours.
  // Try same day, -1, and +1 to be safe.
  for (const d of [String(Number(yyyymmdd) - 1), yyyymmdd, String(Number(yyyymmdd) + 1)]) {
    try {
      const board = await fetchJson(`${ESPN_SCOREBOARD}?dates=${d}`);
      for (const ev of board.events || []) {
        const comps = ev.competitions || [];
        for (const comp of comps) {
          const home = comp.competitors?.find(c => c.homeAway === "home")?.team?.displayName || "";
          const away = comp.competitors?.find(c => c.homeAway === "away")?.team?.displayName || "";
          if (teamsMatch(home, away, match.homeTeam, match.awayTeam)) {
            return ev.id;
          }
        }
      }
    } catch { /* ignore */ }
  }
  return null;
}

async function enrichFromEspn(espnId) {
  const summary = await fetchJson(`${ESPN_SUMMARY}?event=${espnId}`);
  const comp = summary.header?.competitions?.[0];
  if (!comp) return null;

  const result = {};

  // Half-time scores from linescores (index 0 = first half)
  const homeComp = comp.competitors?.find(c => c.homeAway === "home");
  const awayComp = comp.competitors?.find(c => c.homeAway === "away");
  const homeH1 = Number(homeComp?.linescores?.[0]?.displayValue ?? NaN);
  const awayH1 = Number(awayComp?.linescores?.[0]?.displayValue ?? NaN);
  if (!Number.isNaN(homeH1) && !Number.isNaN(awayH1)) {
    result.homeHalfScore = homeH1;
    result.awayHalfScore = awayH1;
  }

  // Yellow and red cards from boxscore stats
  const bsTeams = summary.boxscore?.teams || [];
  let totalYellow = 0, totalRed = 0, hasCardData = false;
  for (const t of bsTeams) {
    for (const stat of t.statistics || []) {
      if (stat.name === "yellowCards") { totalYellow += Number(stat.displayValue || 0); hasCardData = true; }
      if (stat.name === "redCards")    { totalRed    += Number(stat.displayValue || 0); hasCardData = true; }
    }
  }
  if (hasCardData) {
    result.yellowCards = totalYellow;
    result.redCards    = totalRed;
  }

  // Penalty winner (if match went to shootout)
  const statusDesc = comp.status?.type?.description || "";
  if (/penalt/i.test(statusDesc)) {
    const homePens = Number(homeComp?.linescores?.find((_, i, arr) => i === arr.length - 1)?.displayValue ?? NaN);
    const awayPens = Number(awayComp?.linescores?.find((_, i, arr) => i === arr.length - 1)?.displayValue ?? NaN);
    if (!Number.isNaN(homePens) && !Number.isNaN(awayPens)) {
      result.penaltyWinner = homePens > awayPens ? "home" : "away";
    }
  }

  // First half first-goal team from keyEvents
  // Find the earliest goal event in period 1
  const keyEvents = summary.keyEvents || [];
  const goalTypes = new Set(["goal", "goal---header", "goal---freekick", "goal---penalty",
                              "goal---long-range", "own-goal", "penalty"]);
  const h1Goals = keyEvents
    .filter(e => {
      const t = e.type?.type || "";
      return goalTypes.has(t) && e.period?.number === 1;
    })
    .sort((a, b) => (a.clock?.value || 0) - (b.clock?.value || 0));

  if (h1Goals.length > 0) {
    const firstGoalEvent = h1Goals[0];
    const scoringTeamId = firstGoalEvent.team?.id;
    const homeTeamId = homeComp?.team?.id;
    const awayTeamId = awayComp?.team?.id;
    // Own goals are credited to the conceding team
    const isOwnGoal = (firstGoalEvent.type?.type || "").includes("own-goal");
    if (isOwnGoal) {
      result.halfFirstGoalTeam = scoringTeamId === homeTeamId ? "away" : "home";
    } else {
      result.halfFirstGoalTeam = scoringTeamId === homeTeamId ? "home" : "away";
    }
  } else {
    result.halfFirstGoalTeam = "none";
  }

  return result;
}

// --- Main ---

const targets = data.matches.filter(m => {
  if (m.status !== "completed") return false;
  if (targetDate && m.dateText !== targetDate) return false;
  const needsEnrich = m.homeHalfScore == null || m.yellowCards == null || !m.halfFirstGoalTeam;
  return needsEnrich;
});

console.log(`Found ${targets.length} match(es) needing enrichment${targetDate ? ` on ${targetDate}` : ""}`);

let updated = 0;
for (const match of targets) {
  process.stdout.write(`  ${match.homeTeam} vs ${match.awayTeam} ...`);
  try {
    const espnId = await getEspnIdForMatch(match);
    if (!espnId) { console.log(" ESPN ID not found, skip"); continue; }
    const enriched = await enrichFromEspn(espnId);
    if (!enriched) { console.log(" no data, skip"); continue; }
    Object.assign(match, enriched);
    console.log(` ✓  HT=${match.homeHalfScore}-${match.awayHalfScore} YC=${match.yellowCards} RC=${match.redCards} 1stGoal=${match.halfFirstGoalTeam}`);
    updated++;
  } catch (e) {
    console.log(` ✗ ${e.message}`);
  }
}

if (!dryRun && updated > 0) {
  data.importedAt = new Date().toISOString();
  await writeFile(MATCHES_PATH, JSON.stringify(data, null, 2));
  console.log(`\nSaved ${updated} updated match(es) to ${MATCHES_PATH}`);
} else if (dryRun) {
  console.log("\n[dry-run] No file written.");
} else {
  console.log("\nNo updates needed.");
}
