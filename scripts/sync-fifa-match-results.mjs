import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const FIFA_MATCHES_URL = "https://api.fifa.com/api/v3/calendar/matches?language=en&count=500&idCompetition=17&idSeason=285023";
const matchesPath = resolve("data/fifa-matches.json");

const localData = JSON.parse(await readFile(matchesPath, "utf8"));
const response = await fetch(FIFA_MATCHES_URL, {
  headers: {
    accept: "application/json,text/plain,*/*",
    "user-agent": "WorldCupWatchGuide/1.0 static sync",
  },
});

if (!response.ok) {
  throw new Error(`FIFA match API failed: HTTP ${response.status}`);
}

const remoteData = await response.json();
const remoteMatches = Array.isArray(remoteData.Results) ? remoteData.Results : [];
if (!remoteMatches.length) {
  throw new Error("FIFA match API returned 0 matches; static data was not changed");
}

const remoteById = new Map(
  remoteMatches
    .map((match) => [String(match.IdMatch || "").trim(), normalizeRemoteMatch(match)])
    .filter(([id]) => id),
);

let changed = 0;
localData.matches = (localData.matches || []).map((match) => {
  const remote = remoteById.get(String(match.fifaMatchId || "").trim());
  if (!remote) return match;
  const next = {
    ...match,
    status: remote.status,
    homeScore: remote.homeScore,
    awayScore: remote.awayScore,
  };
  if (
    match.status !== next.status ||
    match.homeScore !== next.homeScore ||
    match.awayScore !== next.awayScore
  ) {
    changed += 1;
  }
  return next;
});

localData.importedAt = new Date().toISOString();
localData.counts = {
  ...(localData.counts || {}),
  matches: localData.matches.length,
  completed: localData.matches.filter((match) => match.status === "completed").length,
  scheduled: localData.matches.filter((match) => match.status !== "completed").length,
};

await writeFile(matchesPath, `${JSON.stringify(localData, null, 2)}\n`, "utf8");

console.log(`Synced ${remoteMatches.length} FIFA matches. Updated ${changed} local match record(s).`);

function normalizeRemoteMatch(raw) {
  const homeScore = numberOrNull(raw.Home?.Score ?? raw.HomeTeamScore);
  const awayScore = numberOrNull(raw.Away?.Score ?? raw.AwayTeamScore);
  return {
    status: isCompleted(raw, homeScore, awayScore) ? "completed" : "scheduled",
    homeScore,
    awayScore,
  };
}

function isCompleted(raw, homeScore, awayScore) {
  if (homeScore == null || awayScore == null) return false;
  if (raw.MatchStatus === 0) return true;
  const kickoff = raw.Date ? new Date(raw.Date) : null;
  return kickoff && !Number.isNaN(kickoff.getTime()) && Date.now() >= kickoff.getTime() + 120 * 60 * 1000;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
