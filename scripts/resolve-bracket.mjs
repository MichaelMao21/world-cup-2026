/**
 * resolve-bracket.mjs
 *
 * Resolve knockout-stage placeholder team names (W89, W90, ...) by fetching
 * the ESPN scoreboard for each match's date and matching by UTC kickoff time.
 *
 * This script reads data/fifa-matches.json, finds scheduled matches whose
 * homeTeam or awayTeam is a "W<number>" placeholder, looks up the real team
 * name from ESPN, replaces the placeholder, and writes the file back.
 *
 * Usage:  node scripts/resolve-bracket.mjs
 * Exit:   0 on success (even if nothing changed)
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const matchesPath = resolve("data/fifa-matches.json");
const boardCache = new Map();
const PLACEHOLDER = /^W\d+$/;

const data = JSON.parse(await readFile(matchesPath, "utf8"));
const matches = data.matches || [];

// Find matches that still have placeholder team names
const placeholderMatches = matches.filter(
  (m) => PLACEHOLDER.test(m.homeTeam) || PLACEHOLDER.test(m.awayTeam),
);

if (placeholderMatches.length === 0) {
  console.log("No placeholder matches found. Nothing to resolve.");
  process.exit(0);
}

console.log(`Found ${placeholderMatches.length} match(es) with placeholder teams.`);

let resolved = 0;
let skipped = 0;

for (const match of placeholderMatches) {
  const espnEvent = await findEspnEvent(match);
  if (!espnEvent) {
    console.log(`  SKIP ${match.id}: no ESPN event found for ${match.dateText} ${match.time}`);
    skipped += 1;
    continue;
  }

  const espnHome = getTeamName(espnEvent, "home");
  const espnAway = getTeamName(espnEvent, "away");

  // Skip if ESPN itself still shows a placeholder
  const espnHomeIsPlaceholder = !espnHome || espnHome.includes("Winner") || espnHome.includes("winner");
  const espnAwayIsPlaceholder = !espnAway || espnAway.includes("Winner") || espnAway.includes("winner");

  let changed = false;

  if (PLACEHOLDER.test(match.homeTeam) && !espnHomeIsPlaceholder) {
    console.log(`  ${match.id}: ${match.homeTeam} -> ${espnHome}`);
    match.homeTeam = espnHome;
    changed = true;
  }
  if (PLACEHOLDER.test(match.awayTeam) && !espnAwayIsPlaceholder) {
    console.log(`  ${match.id}: ${match.awayTeam} -> ${espnAway}`);
    match.awayTeam = espnAway;
    changed = true;
  }

  if (changed) {
    resolved += 1;
  } else {
    console.log(`  ${match.id}: ESPN still has placeholders, skipping`);
    skipped += 1;
  }
}

data.importedAt = new Date().toISOString();
data.counts = {
  ...(data.counts || {}),
  matches: matches.length,
  completed: matches.filter((m) => m.status === "completed").length,
  scheduled: matches.filter((m) => m.status !== "completed").length,
};

await writeFile(matchesPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(
  `\nDone. Resolved ${resolved} match(es), skipped ${skipped}. File updated.`,
);

// ── Helpers ──

async function findEspnEvent(match) {
  const utcDate = matchToUtcIso(match);
  if (!utcDate) return null;
  const espnDateStr = dateToEspn(match.dateText);
  if (!espnDateStr) return null;

  // Check the exact date and adjacent days (timezone edge cases)
  for (const candidate of dateCandidates(espnDateStr)) {
    const board = await getBoard(candidate);
    for (const event of board.events || []) {
      if (!event.date) continue;
      const eventUtc = new Date(event.date);
      const matchUtc = new Date(utcDate);
      // Allow ±30 minutes tolerance
      const diffMin = Math.abs(eventUtc - matchUtc) / 60000;
      if (diffMin <= 30) return event;
    }
  }
  return null;
}

function matchToUtcIso(match) {
  const months = {
    January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
    July: 6, August: 7, September: 8, October: 9, November: 10, December: 11,
  };
  const parts = String(match.dateText || "").split(/\s+/);
  const day = Number(parts[1]);
  const month = months[parts[2]];
  const year = Number(parts[3]);
  const [hour, minute] = String(match.time || "").split(":").map(Number);
  if (!year || month === undefined || !Number.isFinite(day) ||
      !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  // Match times are Beijing time (UTC+8). Use Date.UTC to avoid local tz issues.
  const utcMs = Date.UTC(year, month, day, hour, minute, 0, 0) - 8 * 60 * 60 * 1000;
  return new Date(utcMs).toISOString();
}

function getTeamName(event, side) {
  const competition = event.competitions?.[0];
  const competitor = competition?.competitors?.find((c) => c.homeAway === side);
  return competitor?.team?.displayName || "";
}

function dateToEspn(dateText) {
  const months = {
    January: "01", February: "02", March: "03", April: "04", May: "05",
    June: "06", July: "07", August: "08", September: "09", October: "10",
    November: "11", December: "12",
  };
  const parts = String(dateText || "").trim().split(/\s+/);
  const day = (parts[1] || "").padStart(2, "0");
  const month = months[parts[2]];
  const year = parts[3];
  return month && year ? `${year}${month}${day}` : null;
}

function dateCandidates(value) {
  const date = new Date(
    `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00Z`,
  );
  return [-1, 0, 1].map((offset) => {
    const next = new Date(date.getTime() + offset * 24 * 60 * 60 * 1000);
    return `${next.getUTCFullYear()}${String(next.getUTCMonth() + 1).padStart(2, "0")}${String(next.getUTCDate()).padStart(2, "0")}`;
  });
}

async function getBoard(date) {
  if (!boardCache.has(date)) {
    boardCache.set(
      date,
      fetchJson(`${SCOREBOARD_URL}?dates=${date}`).catch(() => ({ events: [] })),
    );
  }
  return boardCache.get(date);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "WorldCupWatchGuide/1.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  return response.json();
}
