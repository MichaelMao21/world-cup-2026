import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const matchesPath = resolve("data/fifa-matches.json");
const data = JSON.parse(await readFile(matchesPath, "utf8"));
const now = new Date();
const boardCache = new Map();
let changed = 0;

for (const match of data.matches || []) {
  if (match.status === "completed") continue;
  const kickoff = parseKickoff(match);
  if (kickoff && now.getTime() < kickoff.getTime() + 90 * 60 * 1000) continue;

  const remote = await findRemoteMatch(match);
  if (!remote || !remote.completed) continue;

  if (match.status !== "completed" || match.homeScore !== remote.homeScore || match.awayScore !== remote.awayScore) {
    match.status = "completed";
    match.homeScore = remote.homeScore;
    match.awayScore = remote.awayScore;
    changed += 1;
    console.log(`Updated ${match.homeTeam} ${match.homeScore}-${match.awayScore} ${match.awayTeam}`);
  }
}

data.importedAt = new Date().toISOString();
data.counts = {
  ...(data.counts || {}),
  matches: (data.matches || []).length,
  completed: (data.matches || []).filter((match) => match.status === "completed").length,
  scheduled: (data.matches || []).filter((match) => match.status !== "completed").length
};

await writeFile(matchesPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(`ESPN result sync updated ${changed} match(es).`);

async function findRemoteMatch(match) {
  const date = dateToEspn(match.dateText);
  if (!date) return null;
  for (const candidate of dateCandidates(date)) {
    const board = await getBoard(candidate);
    for (const event of board.events || []) {
      const competition = event.competitions?.[0];
      const home = competition?.competitors?.find((item) => item.homeAway === "home");
      const away = competition?.competitors?.find((item) => item.homeAway === "away");
      const homeName = home?.team?.displayName || "";
      const awayName = away?.team?.displayName || "";
      if (!teamsMatch(homeName, awayName, match.homeTeam, match.awayTeam)) continue;
      const remoteHomeScore = numberOrNull(home?.score);
      const remoteAwayScore = numberOrNull(away?.score);
      const reversed = norm(homeName) === norm(match.awayTeam) && norm(awayName) === norm(match.homeTeam);
      return {
        completed: Boolean(competition?.status?.type?.completed),
        homeScore: reversed ? remoteAwayScore : remoteHomeScore,
        awayScore: reversed ? remoteHomeScore : remoteAwayScore
      };
    }
  }
  return null;
}

async function getBoard(date) {
  if (!boardCache.has(date)) {
    boardCache.set(date, fetchJson(`${SCOREBOARD_URL}?dates=${date}`).catch(() => ({ events: [] })));
  }
  return boardCache.get(date);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "WorldCupWatchGuide/1.0" },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  return response.json();
}

function parseKickoff(match) {
  if (!match.dateText || !match.time) return null;
  const months = { January:0, February:1, March:2, April:3, May:4, June:5, July:6, August:7, September:8, October:9, November:10, December:11 };
  const parts = String(match.dateText).split(/\s+/);
  const day = Number(parts[1]);
  const month = months[parts[2]];
  const year = Number(parts[3]);
  const [hour, minute] = String(match.time).split(":").map(Number);
  if (!year || month === undefined || !Number.isFinite(day) || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return new Date(year, month, day, hour, minute, 0, 0);
}

function dateToEspn(dateText) {
  const months = { January:"01",February:"02",March:"03",April:"04",May:"05",June:"06",July:"07",August:"08",September:"09",October:"10",November:"11",December:"12" };
  const parts = String(dateText || "").trim().split(/\s+/);
  const day = (parts[1] || "").padStart(2, "0");
  const month = months[parts[2]];
  const year = parts[3];
  return month && year ? `${year}${month}${day}` : null;
}

function dateCandidates(value) {
  const date = new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00Z`);
  return [-1, 0, 1].map((offset) => {
    const next = new Date(date.getTime() + offset * 24 * 60 * 60 * 1000);
    return `${next.getUTCFullYear()}${String(next.getUTCMonth() + 1).padStart(2, "0")}${String(next.getUTCDate()).padStart(2, "0")}`;
  });
}

function teamsMatch(aHome, aAway, bHome, bAway) {
  const ah = norm(aHome), aa = norm(aAway), bh = norm(bHome), ba = norm(bAway);
  return (ah === bh && aa === ba) || (ah === ba && aa === bh);
}

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "")
    .replace("unitedstates", "usa")
    .replace("bosniaandherzegovina", "bosnia")
    .replace("cotedivoire", "ivorycoast")
    .replace("caboverde", "capeverde");
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
