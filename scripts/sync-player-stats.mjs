import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const STATS_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/statistics";
const SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const SUMMARY_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary";
const outputPath = resolve("data/player-stats.json");
const matchData = JSON.parse(await readFile(resolve("data/fifa-matches.json"), "utf8"));

const response = await fetch(STATS_URL, {
  headers: { "user-agent": "WorldCupWatchGuide/1.0" },
  signal: AbortSignal.timeout(15000)
});
if (!response.ok) {
  throw new Error(`ESPN statistics request failed: HTTP ${response.status}`);
}

const payload = await response.json();
const goals = findStat(payload, "goalsLeaders");
const assists = findStat(payload, "assistsLeaders");

const goldenBoot = leaders(goals).map((leader) => {
  const numbers = parseDisplay(leader.displayValue);
  const shortNumbers = parseShortDisplay(leader.shortDisplayValue);
  return {
    name: leader.athlete?.displayName || "",
    team: leader.athlete?.team?.displayName || "",
    gp: numbers.matches || shortNumbers.matches || 0,
    goals: Number(leader.value || numbers.goals || shortNumbers.goals || 0),
    assists: shortNumbers.assists || 0,
    shots: null
  };
}).filter((item) => item.name && item.team);

const distribution = leaders(assists).map((leader) => {
  const numbers = parseDisplay(leader.displayValue);
  const shortNumbers = parseShortDisplay(leader.shortDisplayValue);
  return {
    name: leader.athlete?.displayName || "",
    team: leader.athlete?.team?.displayName || "",
    gp: numbers.matches || shortNumbers.matches || 0,
    assists: Number(leader.value || numbers.assists || shortNumbers.assists || 0),
    chances: null,
    label: "助攻"
  };
}).filter((item) => item.name && item.team);

const aggregates = await aggregateMatchStats(matchData.matches || [], goldenBoot);
const calibratedGoldenBoot = calibrateScorers(goldenBoot, aggregates.scorers);
const scorerCorrections = buildScorerCorrections(goldenBoot, calibratedGoldenBoot, aggregates.scorers);

const playerStats = {
  source: "ESPN FIFA World Cup statistics",
  sourceUrl: STATS_URL,
  importedAt: new Date().toISOString(),
  sourceTimestamp: payload.timestamp || "",
  season: payload.season || {},
  coverage: {
    goldenBoot: "synced",
    distribution: "synced assists",
    attacking: "synced match leaders",
    dribbles: "not available from current source",
    passes: "synced match leaders",
    goalkeeping: "synced match leaders",
    discipline: "synced match events"
  },
  audit: {
    scorerSource: "ESPN statistics leaders plus ESPN match summary goal events",
    sourceGoldenBoot: goldenBoot.slice(0, 20),
    eventGoldenBoot: aggregates.scorers.slice(0, 20),
    scorerCorrections
  },
  goldenBoot: calibratedGoldenBoot,
  attacking: aggregates.attacking.map((item) => ({
    ...item,
    goals: aggregates.scorerGoals.get(playerKey(item.name, item.team)) || item.goals || 0
  })),
  distribution,
  dribbles: [],
  passes: aggregates.passes,
  goalkeeping: aggregates.goalkeeping,
  discipline: aggregates.discipline
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(playerStats, null, 2)}\n`, "utf8");
console.log(`Saved player stats: ${calibratedGoldenBoot.length} scorers, ${distribution.length} assist leaders, ${aggregates.attacking.length} attackers to ${outputPath}`);

function findStat(payload, name) {
  return (payload.stats || []).find((stat) => stat.name === name) || {};
}

function leaders(stat) {
  return Array.isArray(stat.leaders) ? stat.leaders : [];
}

function parseDisplay(value) {
  const result = {};
  const text = String(value || "");
  const matches = text.match(/Matches:\s*(\d+)/i);
  const goals = text.match(/Goals:\s*(\d+)/i);
  const assists = text.match(/Assists:\s*(\d+)/i);
  if (matches) result.matches = Number(matches[1]);
  if (goals) result.goals = Number(goals[1]);
  if (assists) result.assists = Number(assists[1]);
  return result;
}

function parseShortDisplay(value) {
  const result = {};
  const text = String(value || "");
  const matches = text.match(/\bM:\s*(\d+)/i);
  const goals = text.match(/\bG:\s*(\d+)/i);
  const assists = text.match(/\bA:\s*(\d+)/i);
  if (matches) result.matches = Number(matches[1]);
  if (goals) result.goals = Number(goals[1]);
  if (assists) result.assists = Number(assists[1]);
  return result;
}

async function aggregateMatchStats(matches, scorerRows) {
  const completed = matches.filter((match) => match.status === "completed");
  const scoreboardCache = new Map();
  const summaryCache = new Map();
  const shots = new Map();
  const passes = new Map();
  const saves = new Map();
  const cards = new Map();
  const scorers = new Map();
  const goalsByPlayer = new Map(scorerRows.map((row) => [playerKey(row.name, row.team), row.goals]));

  for (const match of completed) {
    const espnId = await getEspnIdForMatch(match, scoreboardCache);
    if (!espnId) continue;
    const summary = await getSummary(espnId, summaryCache);
    if (!summary) continue;

    for (const teamLeaders of summary.leaders || []) {
      const team = teamLeaders.team?.displayName || "";
      const conceded = teamMatches(match.homeTeam, team) ? Number(match.awayScore || 0) : teamMatches(match.awayTeam, team) ? Number(match.homeScore || 0) : 0;
      for (const category of teamLeaders.leaders || []) {
        if (category.name === "totalShots") {
          for (const leader of category.leaders || []) {
            const row = getPlayer(shots, leader.athlete, team, espnId);
            row.shots += statValue(leader, "totalShots");
            row.sog += statValue(leader, "shotsOnTarget");
            row.goals = goalsByPlayer.get(playerKey(row.name, row.team)) || row.goals || 0;
          }
        } else if (category.name === "accuratePasses") {
          for (const leader of category.leaders || []) {
            const row = getPlayer(passes, leader.athlete, team, espnId);
            row.passes += statValue(leader, "accuratePasses");
          }
        } else if (category.name === "saves") {
          for (const leader of category.leaders || []) {
            const row = getPlayer(saves, leader.athlete, team, espnId);
            row.saves += statValue(leader, "saves");
            row.ga += conceded;
            if (conceded === 0) row.cs += 1;
          }
        }
      }
    }

    for (const event of summary.keyEvents || []) {
      const type = event.type?.type || "";
      if (isGoalEvent(type)) {
        const athlete = event.participants?.[0]?.athlete;
        if (athlete?.displayName && !type.includes("own-goal")) {
          const row = getPlayer(scorers, athlete, event.team?.displayName || "", espnId);
          row.goals += 1;
        }
      }
      if (type !== "yellow-card" && type !== "red-card") continue;
      const athlete = event.participants?.[0]?.athlete;
      if (!athlete?.displayName) continue;
      const row = getPlayer(cards, athlete, event.team?.displayName || "", espnId);
      if (type === "yellow-card") row.yc += 1;
      if (type === "red-card") row.rc += 1;
    }
  }

  return {
    scorerGoals: new Map([...scorers.values()].map((row) => [playerKey(row.name, row.team), row.goals])),
    scorers: [...scorers.values()]
      .map((row) => ({ name: row.name, team: row.team, gp: row.gp, goals: row.goals }))
      .sort((a, b) => b.goals - a.goals)
      .slice(0, 50),
    attacking: [...shots.values()]
      .map((row) => ({ name: row.name, team: row.team, gp: row.gp, shots: row.shots, sog: row.sog, goals: row.goals || 0 }))
      .sort((a, b) => b.shots - a.shots || b.sog - a.sog || b.goals - a.goals)
      .slice(0, 20),
    passes: [...passes.values()]
      .map((row) => ({ name: row.name, team: row.team, gp: row.gp, passes: row.passes, label: "传球" }))
      .sort((a, b) => b.passes - a.passes)
      .slice(0, 12),
    goalkeeping: [...saves.values()]
      .map((row) => ({ name: row.name, team: row.team, gp: row.gp, saves: row.saves, ga: row.ga, cs: row.cs }))
      .sort((a, b) => b.saves - a.saves || b.cs - a.cs)
      .slice(0, 12),
    discipline: [...cards.values()]
      .map((row) => ({ name: row.name, team: row.team, gp: row.gp, yc: row.yc, rc: row.rc }))
      .sort((a, b) => (b.rc * 3 + b.yc) - (a.rc * 3 + a.yc) || b.yc - a.yc)
      .slice(0, 20)
  };
}

function calibrateScorers(sourceRows, eventRows) {
  const rows = new Map(sourceRows.map((row) => [playerKey(row.name, row.team), { ...row }]));
  for (const eventRow of eventRows) {
    const key = playerKey(eventRow.name, eventRow.team);
    const current = rows.get(key);
    if (current) {
      if (eventRow.goals > current.goals) current.goals = eventRow.goals;
      if (eventRow.gp > current.gp) current.gp = eventRow.gp;
    } else {
      rows.set(key, {
        name: eventRow.name,
        team: eventRow.team,
        gp: eventRow.gp,
        goals: eventRow.goals,
        assists: 0,
        shots: null
      });
    }
  }
  return [...rows.values()]
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name))
    .slice(0, 50);
}

function buildScorerCorrections(sourceRows, calibratedRows, eventRows) {
  const source = new Map(sourceRows.map((row) => [playerKey(row.name, row.team), row]));
  const calibrated = new Map(calibratedRows.map((row) => [playerKey(row.name, row.team), row]));
  const corrections = [];
  for (const eventRow of eventRows) {
    const key = playerKey(eventRow.name, eventRow.team);
    const sourceRow = source.get(key);
    const finalRow = calibrated.get(key);
    const sourceGoals = sourceRow?.goals ?? 0;
    const finalGoals = finalRow?.goals ?? 0;
    if (eventRow.goals > sourceGoals && finalGoals > sourceGoals) {
      corrections.push({
        name: eventRow.name,
        team: eventRow.team,
        sourceGoals,
        eventGoals: eventRow.goals,
        finalGoals
      });
    }
  }
  return corrections.sort((a, b) => b.eventGoals - a.eventGoals || a.name.localeCompare(b.name));
}

function isGoalEvent(type) {
  return [
    "goal",
    "goal---header",
    "goal---freekick",
    "goal---long-range",
    "penalty---scored",
    "goal---penalty",
    "penalty"
  ].includes(type);
}

async function getEspnIdForMatch(match, cache) {
  const date = dateToEspn(match.dateText);
  if (!date) return null;
  for (const candidate of dateCandidates(date)) {
    if (!cache.has(candidate)) {
      cache.set(candidate, fetchJson(`${SCOREBOARD_URL}?dates=${candidate}`).catch(() => null));
    }
    const board = await cache.get(candidate);
    for (const event of board?.events || []) {
      const comp = event.competitions?.[0];
      const home = comp?.competitors?.find((item) => item.homeAway === "home")?.team?.displayName || "";
      const away = comp?.competitors?.find((item) => item.homeAway === "away")?.team?.displayName || "";
      if (teamsMatch(home, away, match.homeTeam, match.awayTeam)) return event.id;
    }
  }
  return null;
}

async function getSummary(espnId, cache) {
  if (!cache.has(espnId)) {
    cache.set(espnId, fetchJson(`${SUMMARY_URL}?event=${espnId}`).catch(() => null));
  }
  return cache.get(espnId);
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "user-agent": "WorldCupWatchGuide/1.0" },
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

function getPlayer(map, athlete, team, gameId) {
  const name = athlete?.displayName || athlete?.fullName || "";
  const key = playerKey(name, team);
  if (!map.has(key)) {
    map.set(key, { name, team, gp: 0, shots: 0, sog: 0, goals: 0, passes: 0, saves: 0, ga: 0, cs: 0, yc: 0, rc: 0, seen: new Set() });
  }
  const row = map.get(key);
  const gameKey = String(gameId || "");
  if (!row.seen.has(gameKey)) {
    row.seen.add(gameKey);
    row.gp += 1;
  }
  return row;
}

function statValue(leader, name) {
  const stat = (leader.statistics || []).find((item) => item.name === name);
  return Number(stat?.value || leader.value || 0);
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

function teamMatches(a, b) {
  return norm(a) === norm(b);
}

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

function playerKey(name, team) {
  return `${norm(team)}:${norm(name)}`;
}
